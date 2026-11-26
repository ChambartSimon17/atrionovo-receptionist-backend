import { DateTime } from "luxon";

import { BILLING_ZONE, shiftMonth } from "./usage-math.js";
import usageService from "./usage.service.js";
import { billingEnabled, OVERAGE_DAYS, runOverage } from "./stripe-billing.service.js";

// ======================================================
// Billing Scheduler
// ======================================================
//
// Once an hour, in this process:
//
// 1. costs    fetch the costs Vapi and Twilio did not
//             report at once (always, also without Stripe).
// 2. overage  from the 1st, 03:00 (Brussels) to the 7th:
//             invoice the extra minutes and SMS of the
//             month before. Only with billing switched on.
//             Runs again every hour of those days; a month
//             already invoiced is skipped, so a late call
//             report is still caught.
// ======================================================

const HOUR_MS = 60 * 60 * 1000;

let timer = null;
let running = false;

export function overageMonthFor(now) {
  const local = DateTime.fromJSDate(now, { zone: BILLING_ZONE });

  if (local.day > OVERAGE_DAYS || (local.day === 1 && local.hour < 3)) {
    return null;
  }

  return shiftMonth(local.toFormat("yyyy-MM"), -1);
}

async function run(log) {
  if (running) {
    return;
  }

  running = true;

  try {
    await usageService.refreshCosts({ log });

    const month = overageMonthFor(new Date());

    if (month && billingEnabled()) {
      const results = await runOverage(month, { log });
      const invoiced = results.filter((result) => result.invoiceId && !result.skipped);

      if (invoiced.length > 0) {
        log?.info?.({ month, invoiced: invoiced.length }, "Overage invoices made");
      }
    }
  } catch (error) {
    log?.warn?.({ error: error.message }, "Billing run failed");
  } finally {
    running = false;
  }
}

export function startBillingScheduler(log) {
  if (timer) {
    return;
  }

  setTimeout(() => void run(log), 60_000).unref();
  timer = setInterval(() => void run(log), HOUR_MS);
  timer.unref();
}
