import { test } from "node:test";
import assert from "node:assert/strict";

import { fromLookupKey, lookupKey, monthlyEquivalentCents, PLANS, priceCents } from "../src/modules/billing/plans.js";
import {
  costOf,
  isBillable,
  monthOf,
  monthRange,
  overageLines,
  planRevenueCents,
  shiftMonth,
  summarizeUsage,
} from "../src/modules/billing/usage-math.js";
import { overageMonthFor } from "../src/modules/billing/billing.scheduler.js";
import { passwordMatches, sameOrigin } from "../src/modules/admin/admin.routes.js";
import { esc, renderCsv } from "../src/modules/admin/admin-page.js";

const at = (iso) => new Date(iso);
const call = (seconds, iso = "2026-11-10T10:00:00Z", extra = {}) => ({ kind: "CALL", quantity: seconds, occurredAt: at(iso), ...extra });
const sms = (iso = "2026-11-10T10:00:00Z", extra = {}) => ({ kind: "SMS", quantity: 1, occurredAt: at(iso), ...extra });

test("plans match the website and lookup keys round-trip", () => {
  assert.equal(PLANS.PRO.monthCents, 14900);
  assert.equal(PLANS.PRO.includedMinutes, 450);
  assert.equal(priceCents(PLANS.START, "YEAR"), 7900 * 11);
  assert.equal(monthlyEquivalentCents(PLANS.START, "YEAR"), Math.round((7900 * 11) / 12));
  assert.equal(lookupKey("GROEI", "YEAR"), "atrionovo_groei_year");
  assert.deepEqual(fromLookupKey("atrionovo_pro_month"), { planId: "PRO", interval: "MONTH" });
  assert.equal(fromLookupKey("something_else"), null);
});

test("a month is a calendar month in Brussels", () => {
  const { start, end } = monthRange("2026-11");

  assert.equal(start.toISOString(), "2026-10-31T23:00:00.000Z");
  assert.equal(end.toISOString(), "2026-11-30T23:00:00.000Z");
  // 00:30 on 1 December in Brussels is still November in UTC.
  assert.equal(monthOf(at("2026-11-30T23:30:00Z")), "2026-12");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
});

test("minutes are rounded up once over the whole month, not per call", () => {
  const usage = summarizeUsage([call(70), call(70), call(70)], { billingPlan: "START" });

  // 210 s = 3.5 min -> 4, not 3 x 2 = 6.
  assert.equal(usage.minutes, 4);
  assert.equal(usage.calls, 3);
  assert.equal(usage.extraMinutes, 0);
});

test("extra minutes and SMS above the plan", () => {
  const records = [call(450 * 60 + 61), ...Array.from({ length: 203 }, () => sms())];
  const usage = summarizeUsage(records, { billingPlan: "PRO" });

  assert.equal(usage.minutes, 452);
  assert.equal(usage.extraMinutes, 2);
  assert.equal(usage.sms, 203);
  assert.equal(usage.extraSms, 3);
  assert.equal(usage.extraCents, 2 * 25 + 3 * 12);

  const lines = overageLines(usage, "november 2026");
  assert.deepEqual(lines.map((line) => line.amountCents), [50, 36]);
  assert.match(lines[0].description, /^2 extra belminuten in november 2026/);
});

test("usage during the trial never counts as extra", () => {
  const business = { billingPlan: "START", trialEndsAt: at("2026-11-15T00:00:00Z") };
  const usage = summarizeUsage(
    [call(300 * 60, "2026-11-05T10:00:00Z"), call(150 * 60, "2026-11-20T10:00:00Z")],
    business
  );

  assert.equal(usage.minutes, 450);
  assert.equal(usage.extraMinutes, 0);
});

test("without a plan nothing is extra", () => {
  const usage = summarizeUsage([call(10_000 * 60)], { billingPlan: null });

  assert.equal(usage.extraMinutes, 0);
  assert.equal(usage.extraCents, 0);
});

test("cost: reported costs converted, missing ones estimated", () => {
  const costs = { rates: { USD: 0.5, EUR: 1 }, callEurPerMinute: 0.1, smsEurPerSegment: 0.08 };
  const reported = costOf([call(60, undefined, { costAmount: "0.40", costCurrency: "USD" })], costs);

  assert.equal(reported.callsEur, 0.2);
  assert.equal(reported.estimated, false);

  const estimated = costOf([call(120), sms(undefined, { quantity: 2 })], costs);

  assert.ok(Math.abs(estimated.callsEur - 0.2) < 1e-9);
  assert.ok(Math.abs(estimated.smsEur - 0.16) < 1e-9);
  assert.equal(estimated.estimated, true);
});

test("revenue: nothing in the trial or for a demo, a yearly plan per month", () => {
  const paying = { billingPlan: "PRO", billingInterval: "MONTH", subscriptionStatus: "active", stripeSubscriptionId: "sub_1" };

  assert.equal(planRevenueCents(paying), 14900);
  assert.equal(planRevenueCents({ ...paying, subscriptionStatus: "trialing" }), 0);
  assert.equal(planRevenueCents({ ...paying, isDemo: true }), 0);
  assert.equal(planRevenueCents({ ...paying, billingInterval: "YEAR" }), Math.round((14900 * 11) / 12));
  assert.equal(isBillable(paying), true);
  assert.equal(isBillable({ ...paying, subscriptionStatus: "canceled" }), false);
  assert.equal(isBillable({ ...paying, stripeSubscriptionId: null }), false);
});

test("overage runs for last month from the 1st 03:00 to the 7th (Brussels)", () => {
  assert.equal(overageMonthFor(at("2026-12-01T01:00:00Z")), null); // 02:00 local
  assert.equal(overageMonthFor(at("2026-12-01T02:30:00Z")), "2026-11"); // 03:30 local
  assert.equal(overageMonthFor(at("2026-12-07T20:00:00Z")), "2026-11");
  assert.equal(overageMonthFor(at("2026-12-08T10:00:00Z")), null);
  assert.equal(overageMonthFor(at("2027-01-02T10:00:00Z")), "2026-12");
});

test("admin password check", () => {
  const header = (user, password) => `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
  const password = "a-long-admin-password-1234";

  assert.equal(passwordMatches(header("simon", password), password), true);
  assert.equal(passwordMatches(header("anyone", password), password), true);
  assert.equal(passwordMatches(header("simon", "wrong"), password), false);
  assert.equal(passwordMatches(header("simon", `${password}:x`), password), false);
  assert.equal(passwordMatches(undefined, password), false);
  assert.equal(passwordMatches(header("simon", ""), undefined), false);
});

test("admin POSTs only from the site itself", () => {
  assert.equal(sameOrigin({ "sec-fetch-site": "same-origin" }), true);
  assert.equal(sameOrigin({ "sec-fetch-site": "cross-site" }), false);
  assert.equal(sameOrigin({ origin: "https://api.example.com", host: "api.example.com" }), true);
  assert.equal(sameOrigin({ origin: "https://evil.example", host: "api.example.com" }), false);
  assert.equal(sameOrigin({ host: "api.example.com" }), false);
});

test("HTML and CSV escape what comes from the database", () => {
  assert.equal(esc(`<b>"Tom & Jerry's"</b>`), "&lt;b&gt;&quot;Tom &amp; Jerry&#39;s&quot;&lt;/b&gt;");

  const row = {
    account: { name: "=HYPERLINK(\"x\")", type: "MASSAGE", plan: null, planId: null },
    calls: 1, minutes: 1, sms: 0, extraMinutes: 0, extraSms: 0, aiBookings: 0,
    callCostCents: 12, smsCostCents: 0, costCents: 12, estimated: false,
    revenueCents: 0, invoicedCents: 0, marginCents: -12,
  };
  const csv = renderCsv({ month: "2026-11", customers: [row], demos: [], internal: { ...row, account: undefined } });

  assert.ok(csv.startsWith("﻿"));
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv, /"0,12"/);
});
