// ======================================================
// AtrioNovo plans
// ======================================================
//
// The same plans as atrionovo.com/prijzen (site.js in the
// website repo). Change both together.
//
// Prices in cents, excluding VAT. A yearly plan is paid
// upfront and costs eleven months (one month free). The
// minutes and SMS are included per calendar month, for
// yearly plans too.
//
// In Stripe every plan is a product with two prices,
// found by lookup key: atrionovo_<plan>_<month|year>
// (created by scripts/billing/setup-stripe.mjs).
// ======================================================

export const PLANS = {
  START: {
    id: "START",
    name: "Start",
    monthCents: 7900,
    includedMinutes: 200,
    includedSms: 100,
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    monthCents: 14900,
    includedMinutes: 450,
    includedSms: 200,
  },
  GROEI: {
    id: "GROEI",
    name: "Groei",
    monthCents: 24900,
    includedMinutes: 900,
    includedSms: 300,
  },
};

// Above the plan, per minute and per SMS.
export const EXTRA_MINUTE_CENTS = 25;
export const EXTRA_SMS_CENTS = 12;

export const VAT_PERCENT = 21;

export function planById(id) {
  return id ? PLANS[id] ?? null : null;
}

/**
 * The price of a plan for one interval, in cents.
 */
export function priceCents(plan, interval) {
  return interval === "YEAR" ? plan.monthCents * 11 : plan.monthCents;
}

/**
 * What a plan brings in per month: a yearly plan counts
 * as a twelfth of its price.
 */
export function monthlyEquivalentCents(plan, interval) {
  return Math.round(priceCents(plan, interval) / (interval === "YEAR" ? 12 : 1));
}

export function lookupKey(planId, interval) {
  return `atrionovo_${planId.toLowerCase()}_${interval === "YEAR" ? "year" : "month"}`;
}

/**
 * The plan and interval of a Stripe price lookup key, or
 * null when it is not one of ours.
 */
export function fromLookupKey(key) {
  const match = /^atrionovo_([a-z]+)_(month|year)$/.exec(key ?? "");
  const plan = match && PLANS[match[1].toUpperCase()];

  return plan
    ? { planId: plan.id, interval: match[2] === "year" ? "YEAR" : "MONTH" }
    : null;
}
