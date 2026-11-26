import prisma from "../../db/prisma.js";
import env from "../../config/env.js";
import { monthRange, summarizeUsage, costOf } from "./usage-math.js";

// ======================================================
// Usage (metering)
// ======================================================
//
// Every call the receptionist answers and every SMS the
// backend sends becomes one UsageRecord, with what the
// provider charged us when it says so:
//
//   call   Vapi's end-of-call report (cost in USD)
//   SMS    Twilio's answer has no price yet; it is fetched
//          later by refreshCosts (see billing.scheduler)
//
// Recording never fails the call report or the SMS: the
// callers catch and log.
// ======================================================

const VAPI_API = "https://api.vapi.ai";
const PROVIDER_TIMEOUT_MS = 10_000;

// Costs not reported within this time stay an estimate.
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function costSettings() {
  return {
    rates: { USD: env.usdToEur, EUR: 1 },
    callEurPerMinute: env.callCostEstimateEurPerMinute,
    smsEurPerSegment: env.smsCostEstimateEurPerSegment,
  };
}

function cost(amount) {
  const value = Number(amount);

  return Number.isFinite(value) && value > 0 ? value : null;
}

class UsageService {
  /**
   * One call. businessId null: our own (live demo).
   * A repeated report updates the same record.
   */
  async recordCall({ businessId, externalId, source, seconds, occurredAt, costUsd, breakdown }) {
    const amount = cost(costUsd);
    const data = {
      businessId: businessId ?? null,
      kind: "CALL",
      source,
      occurredAt,
      quantity: Math.max(0, Math.round(seconds ?? 0)),
      ...(amount !== null && {
        costAmount: amount,
        costCurrency: "USD",
        costBreakdown: breakdown ?? undefined,
      }),
    };

    return prisma.usageRecord.upsert({
      where: { externalId },
      create: data,
      update: data,
    });
  }

  /**
   * One SMS. externalId is Twilio's message sid when it
   * gave one.
   */
  async recordSms({ businessId, externalId, source, segments, occurredAt }) {
    return prisma.usageRecord.upsert({
      where: { externalId },
      create: {
        businessId: businessId ?? null,
        kind: "SMS",
        source,
        externalId,
        occurredAt: occurredAt ?? new Date(),
        quantity: Math.max(1, Number(segments) || 1),
      },
      update: {},
    });
  }

  /**
   * The records of a month: of one business, of our own
   * use (businessId null), or of everyone (undefined).
   */
  async monthRecords(month, businessId) {
    const { start, end } = monthRange(month);

    return prisma.usageRecord.findMany({
      where: {
        occurredAt: { gte: start, lt: end },
        ...(businessId !== undefined && { businessId }),
      },
      select: {
        businessId: true,
        kind: true,
        source: true,
        quantity: true,
        occurredAt: true,
        costAmount: true,
        costCurrency: true,
      },
    });
  }

  /**
   * Usage of one business in one month, against its plan,
   * with our cost.
   */
  async businessMonth(business, month) {
    const records = await this.monthRecords(month, business.id);

    return {
      ...summarizeUsage(records, business),
      cost: costOf(records, costSettings()),
    };
  }

  /**
   * Fetches costs the providers did not report at once:
   * Vapi calls without a cost and Twilio SMS. A few per
   * run, recent ones only. Returns how many were filled.
   */
  async refreshCosts({ limit = 40, log } = {}) {
    const since = new Date(Date.now() - REFRESH_WINDOW_MS);
    const settled = new Date(Date.now() - 5 * 60 * 1000);

    const open = await prisma.usageRecord.findMany({
      where: {
        costAmount: null,
        occurredAt: { gte: since, lt: settled },
      },
      orderBy: { occurredAt: "asc" },
      take: limit,
    });

    let filled = 0;

    for (const record of open) {
      try {
        const found =
          record.kind === "CALL"
            ? await this.#vapiCost(record.externalId)
            : await this.#twilioCost(record.externalId);

        if (found) {
          await prisma.usageRecord.update({ where: { id: record.id }, data: found });
          filled += 1;
        }
      } catch (error) {
        log?.warn?.({ id: record.id, error: error.message }, "Usage cost refresh failed");
      }
    }

    return filled;
  }

  async #vapiCost(callId) {
    if (!env.vapiApiKey) {
      return null;
    }

    const response = await fetch(`${VAPI_API}/call/${encodeURIComponent(callId)}`, {
      headers: { Authorization: `Bearer ${env.vapiApiKey}` },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const call = await response.json();
    const amount = cost(call.cost);

    return amount === null
      ? null
      : { costAmount: amount, costCurrency: "USD", costBreakdown: call.costBreakdown ?? undefined };
  }

  async #twilioCost(sid) {
    const account = env.twilioAccountSid;

    // Our own keys (no sid from Twilio) have nothing to fetch.
    if (!account || !env.twilioAuthToken || !/^(SM|MM)[0-9a-f]{32}$/i.test(sid)) {
      return null;
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${account}/Messages/${sid}.json`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${account}:${env.twilioAuthToken}`).toString("base64")}`,
        },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      }
    );

    if (!response.ok) {
      return null;
    }

    const message = await response.json();

    // Twilio reports the price as a negative string.
    const amount = cost(Math.abs(Number(message.price)));

    return amount === null
      ? null
      : {
          costAmount: amount,
          costCurrency: String(message.price_unit || "USD").toUpperCase(),
          quantity: Math.max(1, Number(message.num_segments) || 1),
        };
  }
}

export default new UsageService();
