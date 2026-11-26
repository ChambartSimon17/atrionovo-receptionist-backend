import { DateTime } from "luxon";

import {
  EXTRA_MINUTE_CENTS,
  EXTRA_SMS_CENTS,
  monthlyEquivalentCents,
  planById,
} from "./plans.js";

// ======================================================
// Usage math
// ======================================================
//
// Pure: no database, no clock (the caller passes "now").
//
// Rules
// - A usage month is a calendar month in Europe/Brussels,
//   written "2026-11".
// - Minutes: all call seconds of the month added up and
//   rounded up once, at the end (never per call).
// - SMS: one per message sent, however many segments.
// - Usage during the free trial never counts as extra.
// - Our cost is what Vapi and Twilio charged, converted
//   to euro; when a provider did not report it yet, an
//   estimate (marked as such).
// ======================================================

export const BILLING_ZONE = "Europe/Brussels";

// Stripe statuses in which the business pays the plan.
const PAYING_STATUSES = ["active", "past_due", "unpaid"];

// Stripe statuses we show as a problem in the report.
export const PROBLEM_STATUSES = ["past_due", "unpaid", "incomplete", "incomplete_expired"];

export function monthOf(date, zone = BILLING_ZONE) {
  return DateTime.fromJSDate(date, { zone }).toFormat("yyyy-MM");
}

export function isMonth(value) {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/**
 * Start (inclusive) and end (exclusive) of a usage month,
 * as Dates.
 */
export function monthRange(month, zone = BILLING_ZONE) {
  const start = DateTime.fromFormat(month, "yyyy-MM", { zone });

  if (!start.isValid) {
    throw new Error(`Not a month: ${month}`);
  }

  return {
    start: start.toJSDate(),
    end: start.plus({ months: 1 }).toJSDate(),
  };
}

export function shiftMonth(month, by) {
  return DateTime.fromFormat(month, "yyyy-MM", { zone: BILLING_ZONE })
    .plus({ months: by })
    .toFormat("yyyy-MM");
}

export function billableMinutes(seconds) {
  return Math.ceil(Math.max(0, seconds) / 60);
}

/**
 * Euro of one provider cost. rates: { USD: 0.86, EUR: 1 }.
 * Unknown currency: null (the caller estimates).
 */
export function toEur(amount, currency, rates) {
  if (amount === null || amount === undefined) {
    return null;
  }

  const rate = rates[String(currency ?? "USD").toUpperCase()];

  return rate === undefined ? null : Number(amount) * rate;
}

/**
 * Our cost of a set of usage records, in euro.
 *
 * records: [{ kind, quantity, costAmount, costCurrency }]
 * costs: { rates, callEurPerMinute, smsEurPerSegment }
 *
 * Returns { callsEur, smsEur, totalEur, estimated } where
 * estimated says whether any part is an estimate.
 */
export function costOf(records, costs) {
  let callsEur = 0;
  let smsEur = 0;
  let estimated = false;

  for (const record of records) {
    let eur = toEur(record.costAmount, record.costCurrency, costs.rates);

    if (eur === null) {
      estimated = true;
      eur =
        record.kind === "CALL"
          ? (record.quantity / 60) * costs.callEurPerMinute
          : Math.max(1, record.quantity) * costs.smsEurPerSegment;
    }

    if (record.kind === "CALL") {
      callsEur += eur;
    } else {
      smsEur += eur;
    }
  }

  return { callsEur, smsEur, totalEur: callsEur + smsEur, estimated };
}

/**
 * Usage of one business in one month, against its plan.
 *
 * records: the month's UsageRecords of the business.
 * business: { billingPlan, trialEndsAt }
 *
 * Usage before trialEndsAt counts for the totals but never
 * as extra.
 */
export function summarizeUsage(records, business) {
  const plan = planById(business.billingPlan);
  const trialEnd = business.trialEndsAt ? new Date(business.trialEndsAt) : null;
  const counts = (record) => !trialEnd || new Date(record.occurredAt) >= trialEnd;

  let seconds = 0;
  let billedSeconds = 0;
  let calls = 0;
  let sms = 0;
  let billedSms = 0;

  for (const record of records) {
    if (record.kind === "CALL") {
      calls += 1;
      seconds += record.quantity;
      billedSeconds += counts(record) ? record.quantity : 0;
    } else {
      sms += 1;
      billedSms += counts(record) ? 1 : 0;
    }
  }

  const minutes = billableMinutes(seconds);
  const includedMinutes = plan?.includedMinutes ?? 0;
  const includedSms = plan?.includedSms ?? 0;
  const extraMinutes = plan
    ? Math.max(0, billableMinutes(billedSeconds) - includedMinutes)
    : 0;
  const extraSms = plan ? Math.max(0, billedSms - includedSms) : 0;

  return {
    calls,
    seconds,
    minutes,
    sms,
    includedMinutes,
    includedSms,
    extraMinutes,
    extraSms,
    extraCents: extraMinutes * EXTRA_MINUTE_CENTS + extraSms * EXTRA_SMS_CENTS,
  };
}

/**
 * Whether we bill the business: a plan, a Stripe
 * subscription, and not a demo.
 */
export function isBillable(business) {
  return Boolean(
    business.billingPlan &&
      business.stripeSubscriptionId &&
      !business.isDemo &&
      business.subscriptionStatus &&
      !["canceled", "incomplete_expired"].includes(business.subscriptionStatus)
  );
}

/**
 * What the plan brings in for a month, in cents: nothing
 * during the trial or without a paid subscription.
 */
export function planRevenueCents(business) {
  const plan = planById(business.billingPlan);

  if (!plan || business.isDemo || !PAYING_STATUSES.includes(business.subscriptionStatus)) {
    return 0;
  }

  return monthlyEquivalentCents(plan, business.billingInterval);
}

/**
 * The lines of an overage invoice: [{ key, description,
 * amountCents, quantity }]. Empty when nothing is extra.
 */
export function overageLines(summary, monthLabel) {
  const lines = [];

  if (summary.extraMinutes > 0) {
    lines.push({
      key: "minutes",
      quantity: summary.extraMinutes,
      amountCents: summary.extraMinutes * EXTRA_MINUTE_CENTS,
      description: `${summary.extraMinutes} extra belminuten in ${monthLabel} (€ ${euro(EXTRA_MINUTE_CENTS)} per minuut)`,
    });
  }

  if (summary.extraSms > 0) {
    lines.push({
      key: "sms",
      quantity: summary.extraSms,
      amountCents: summary.extraSms * EXTRA_SMS_CENTS,
      description: `${summary.extraSms} extra sms'en in ${monthLabel} (€ ${euro(EXTRA_SMS_CENTS)} per sms)`,
    });
  }

  return lines;
}

export function monthLabel(month, locale = "nl") {
  return DateTime.fromFormat(month, "yyyy-MM", { zone: BILLING_ZONE })
    .setLocale(locale)
    .toFormat("LLLL yyyy");
}

function euro(cents) {
  return (cents / 100).toFixed(2).replace(".", ",");
}
