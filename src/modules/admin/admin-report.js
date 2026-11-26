import prisma from "../../db/prisma.js";
import { planById } from "../billing/plans.js";
import {
  costOf,
  isBillable,
  monthOf,
  monthRange,
  planRevenueCents,
  PROBLEM_STATUSES,
  shiftMonth,
  summarizeUsage,
} from "../billing/usage-math.js";
import { costSettings } from "../billing/usage.service.js";

// ======================================================
// Usage report (admin)
// ======================================================
//
// Per account and month: calls, minutes, SMS, what it
// cost us (Vapi, Twilio), what it brings in, the margin,
// and how many bookings the AI made.
//
// Revenue of a month = the plan (a yearly plan as a
// twelfth; nothing during the trial) + the extra minutes
// and SMS of that month. "Invoiced" is what Stripe
// actually invoiced in that month, excluding VAT.
//
// Groups: customers, demo accounts, and our own use (the
// live demo on the website, businessId null).
//
// Buckets in JavaScript: fine for the number of calls of a
// few dozen businesses. Move to SQL groupBy when it grows.
// ======================================================

const INTERNAL_ID = "internal";

function euroCents(eur) {
  return Math.round(eur * 100);
}

function emptyTotals() {
  return {
    calls: 0,
    minutes: 0,
    sms: 0,
    extraMinutes: 0,
    extraSms: 0,
    costCents: 0,
    revenueCents: 0,
    invoicedCents: 0,
    aiBookings: 0,
    estimated: false,
  };
}

function addTo(totals, row) {
  for (const key of Object.keys(totals)) {
    if (key === "estimated") {
      totals.estimated ||= row.estimated;
    } else {
      totals[key] += row[key] ?? 0;
    }
  }

  return totals;
}

function finish(totals) {
  const marginCents = totals.revenueCents - totals.costCents;

  return {
    ...totals,
    marginCents,
    marginPercent: totals.revenueCents > 0 ? (marginCents / totals.revenueCents) * 100 : null,
    costPerMinuteCents: totals.minutes > 0 ? totals.costCents / totals.minutes : null,
    costPerBookingCents: totals.aiBookings > 0 ? totals.costCents / totals.aiBookings : null,
  };
}

function groupBy(list, keyOf) {
  const map = new Map();

  for (const item of list) {
    const key = keyOf(item);

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key).push(item);
  }

  return map;
}

async function aiBookingsByBusiness(start, end, businessId) {
  const where = {
    source: "AI",
    createdAt: { gte: start, lt: end },
    ...(businessId && { businessId }),
  };

  const [appointments, reservations] = await Promise.all([
    prisma.appointment.findMany({ where, select: { businessId: true, createdAt: true } }),
    prisma.reservation.findMany({ where, select: { businessId: true, createdAt: true } }),
  ]);

  return [...appointments, ...reservations];
}

async function invoicesIn(start, end, businessId) {
  return prisma.billingInvoice.findMany({
    where: {
      issuedAt: { gte: start, lt: end },
      stripeInvoiceId: { not: null },
      status: { notIn: ["draft", "void"] },
      ...(businessId && { businessId }),
    },
    select: { businessId: true, subtotalCents: true, issuedAt: true },
  });
}

function rowFor(business, records, bookings, invoices) {
  const usage = summarizeUsage(records, business ?? {});
  const cost = costOf(records, costSettings());
  const billable = business ? isBillable(business) : false;
  const revenueCents = business ? planRevenueCents(business) + (billable ? usage.extraCents : 0) : 0;

  return finish({
    calls: usage.calls,
    minutes: usage.minutes,
    sms: usage.sms,
    includedMinutes: usage.includedMinutes,
    includedSms: usage.includedSms,
    extraMinutes: billable ? usage.extraMinutes : 0,
    extraSms: billable ? usage.extraSms : 0,
    callCostCents: euroCents(cost.callsEur),
    smsCostCents: euroCents(cost.smsEur),
    costCents: euroCents(cost.totalEur),
    estimated: cost.estimated,
    revenueCents,
    invoicedCents: invoices.reduce((sum, invoice) => sum + invoice.subtotalCents, 0),
    aiBookings: bookings.length,
  });
}

export function accountInfo(business) {
  const plan = planById(business.billingPlan);
  const status = business.subscriptionStatus;

  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    type: business.businessType,
    isDemo: business.isDemo,
    plan: plan?.name ?? null,
    planId: plan?.id ?? null,
    interval: business.billingInterval,
    status,
    trialEndsAt: business.trialEndsAt,
    cancelAtPeriodEnd: business.cancelAtPeriodEnd,
    hasSubscription: Boolean(business.stripeSubscriptionId),
    problem: PROBLEM_STATUSES.includes(status),
    createdAt: business.createdAt,
  };
}

/**
 * The report of one month: rows per group, totals, and
 * the totals of the twelve months up to it.
 */
export async function monthReport(month) {
  const { start, end } = monthRange(month);

  const [businesses, records, bookings, invoices] = await Promise.all([
    prisma.business.findMany({ orderBy: { name: "asc" } }),
    prisma.usageRecord.findMany({
      where: { occurredAt: { gte: start, lt: end } },
      select: {
        businessId: true,
        kind: true,
        quantity: true,
        occurredAt: true,
        costAmount: true,
        costCurrency: true,
      },
    }),
    aiBookingsByBusiness(start, end),
    invoicesIn(start, end),
  ]);

  const recordsBy = groupBy(records, (record) => record.businessId ?? INTERNAL_ID);
  const bookingsBy = groupBy(bookings, (booking) => booking.businessId);
  const invoicesBy = groupBy(invoices, (invoice) => invoice.businessId);

  const rows = businesses
    .map((business) => ({
      account: accountInfo(business),
      ...rowFor(
        business,
        recordsBy.get(business.id) ?? [],
        bookingsBy.get(business.id) ?? [],
        invoicesBy.get(business.id) ?? []
      ),
    }))
    // An account without any use or money this month and
    // without a plan is noise.
    .filter(
      (row) =>
        row.calls > 0 ||
        row.sms > 0 ||
        row.aiBookings > 0 ||
        row.revenueCents > 0 ||
        row.invoicedCents > 0 ||
        row.account.planId
    );

  const customers = rows.filter((row) => !row.account.isDemo);
  const demos = rows.filter((row) => row.account.isDemo);
  const internal = rowFor(null, recordsBy.get(INTERNAL_ID) ?? [], [], []);

  const customerTotals = finish(customers.reduce(addTo, emptyTotals()));
  const allTotals = finish(addTo(addTo(addTo(emptyTotals(), customerTotals), demos.reduce(addTo, emptyTotals())), internal));

  const payingCount = businesses.filter((business) => planRevenueCents(business) > 0).length;
  const trialCount = businesses.filter((business) => business.subscriptionStatus === "trialing").length;
  const problemCount = businesses.filter((business) => PROBLEM_STATUSES.includes(business.subscriptionStatus)).length;

  return {
    month,
    customers,
    demos,
    internal,
    customerTotals,
    demoTotals: finish(demos.reduce(addTo, emptyTotals())),
    allTotals,
    counts: { paying: payingCount, trialing: trialCount, problems: problemCount },
    history: await history(month),
    unassignedRecords: records.filter(
      (record) => record.businessId && !businesses.some((business) => business.id === record.businessId)
    ).length,
  };
}

/**
 * Totals per month for the twelve months up to `month`,
 * for everyone or one business. Revenue here is what was
 * invoiced (the plan revenue of past months depends on
 * statuses we do not keep history of).
 */
export async function history(month, businessId) {
  const first = shiftMonth(month, -11);
  const start = monthRange(first).start;
  const end = monthRange(month).end;

  const [records, bookings, invoices, calls] = await Promise.all([
    prisma.usageRecord.findMany({
      where: { occurredAt: { gte: start, lt: end }, ...(businessId && { businessId }) },
      select: { businessId: true, kind: true, quantity: true, occurredAt: true, costAmount: true, costCurrency: true },
    }),
    aiBookingsByBusiness(start, end, businessId),
    invoicesIn(start, end, businessId),
    businessId
      ? prisma.callLog.findMany({
          where: { businessId, startedAt: { gte: start, lt: end } },
          select: { outcome: true, startedAt: true },
        })
      : [],
  ]);

  const recordsBy = groupBy(records, (record) => monthOf(record.occurredAt));
  const bookingsBy = groupBy(bookings, (booking) => monthOf(booking.createdAt));
  const invoicesBy = groupBy(invoices, (invoice) => monthOf(invoice.issuedAt));
  const callsBy = groupBy(calls, (call) => monthOf(call.startedAt));

  const months = [];

  for (let i = 0; i < 12; i += 1) {
    const key = shiftMonth(first, i);
    const monthRecords = recordsBy.get(key) ?? [];
    const usage = summarizeUsage(monthRecords, {});
    const cost = costOf(monthRecords, costSettings());

    // Minutes are rounded up per account, as on its bill.
    const minutes = [...groupBy(monthRecords, (record) => record.businessId ?? INTERNAL_ID).values()]
      .reduce((sum, records) => sum + summarizeUsage(records, {}).minutes, 0);
    const invoiced = (invoicesBy.get(key) ?? []).reduce((sum, invoice) => sum + invoice.subtotalCents, 0);
    const outcomes = { BOOKED: 0, CHANGED: 0, INFORMATION: 0, NEEDS_CALLBACK: 0 };

    for (const call of callsBy.get(key) ?? []) {
      outcomes[call.outcome] += 1;
    }

    months.push({
      month: key,
      calls: usage.calls,
      minutes,
      sms: usage.sms,
      costCents: euroCents(cost.totalEur),
      estimated: cost.estimated,
      invoicedCents: invoiced,
      marginCents: invoiced - euroCents(cost.totalEur),
      aiBookings: (bookingsBy.get(key) ?? []).length,
      outcomes,
    });
  }

  return months;
}

/**
 * One business: account, this month's row, history and
 * invoices.
 */
export async function businessReport(businessId, month) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });

  if (!business) {
    return null;
  }

  const { start, end } = monthRange(month);

  const [records, bookings, invoicesOfMonth, invoices] = await Promise.all([
    prisma.usageRecord.findMany({
      where: { businessId, occurredAt: { gte: start, lt: end } },
      select: { kind: true, quantity: true, occurredAt: true, costAmount: true, costCurrency: true },
    }),
    aiBookingsByBusiness(start, end, businessId),
    invoicesIn(start, end, businessId),
    prisma.billingInvoice.findMany({
      where: { businessId },
      orderBy: { issuedAt: "desc" },
      take: 24,
    }),
  ]);

  return {
    month,
    account: accountInfo(business),
    row: rowFor(business, records, bookings, invoicesOfMonth),
    history: await history(month, businessId),
    invoices,
  };
}
