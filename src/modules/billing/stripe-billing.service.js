import Stripe from "stripe";

import prisma from "../../db/prisma.js";
import env from "../../config/env.js";
import AppError from "../../errors/AppError.js";
import NotFoundError from "../../errors/NotFoundError.js";
import { fromLookupKey, lookupKey, planById } from "./plans.js";
import {
  isBillable,
  monthLabel,
  monthRange,
  overageLines,
  summarizeUsage,
} from "./usage-math.js";
import usageService from "./usage.service.js";

// ======================================================
// AtrioNovo billing in Stripe
// ======================================================
//
// What a business pays AtrioNovo. Our own Stripe account
// (STRIPE_SECRET_KEY, the same one as Connect), only when
// STRIPE_BILLING_ENABLED=true.
//
// subscription  one per business: the plan, monthly or
//               yearly, 21% VAT, optional 14-day trial.
//               Started and changed from /admin.
// portal        the owner adds a card, downloads invoices
//               and changes or cancels the plan in Stripe's
//               own customer portal (link from the app).
// overage       early each month, extra minutes and SMS of
//               the month before on an invoice of their
//               own (runOverage, from billing.scheduler).
// webhook       Stripe tells us the subscription status
//               and every invoice; copied onto Business and
//               BillingInvoice.
//
// Products, prices, the VAT rate and the portal are made
// once by scripts/billing/setup-stripe.mjs and found here
// by lookup key and metadata.
//
// A trial that ends without a card, or a payment that
// fails: Stripe leaves the subscription past_due. The
// receptionist keeps answering; /admin shows it in red.
// ======================================================

const stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey) : null;

const TRIAL_DAYS = 14;

// Overage invoices are made in the first days of a month
// only, so a call report that arrives very late never
// sends a surprise invoice weeks later.
const OVERAGE_LAST_DAY = 7;

function billingError(message, code, statusCode = 400) {
  const error = new AppError(message, statusCode);

  error.code = code;

  return error;
}

function requireBilling() {
  if (!stripe || !env.stripeBillingEnabled) {
    throw billingError(
      "Billing is switched off (STRIPE_BILLING_ENABLED).",
      "BILLING_DISABLED",
      503
    );
  }

  return stripe;
}

export function billingEnabled() {
  return Boolean(stripe && env.stripeBillingEnabled);
}

// ------------------------------------------------------
// What setup-stripe.mjs made, found once per process
// ------------------------------------------------------

let catalog = null;

async function loadCatalog() {
  if (catalog) {
    return catalog;
  }

  const client = requireBilling();
  const keys = ["START", "PRO", "GROEI"].flatMap((plan) => [
    lookupKey(plan, "MONTH"),
    lookupKey(plan, "YEAR"),
  ]);

  const [prices, taxRates, portals] = await Promise.all([
    client.prices.list({ lookup_keys: keys, active: true, limit: 20 }),
    client.taxRates.list({ active: true, limit: 100 }),
    client.billingPortal.configurations.list({ active: true, limit: 100 }),
  ]);

  const priceIds = Object.fromEntries(prices.data.map((price) => [price.lookup_key, price.id]));
  const vat = taxRates.data.find((rate) => rate.metadata?.atrionovo === "vat_be_21");
  const portal = portals.data.find((config) => config.metadata?.atrionovo === "portal");

  const missing = keys.filter((key) => !priceIds[key]);

  if (missing.length > 0 || !vat) {
    throw billingError(
      `Stripe is not set up for billing (missing ${[...missing, ...(vat ? [] : ["VAT rate"])].join(", ")}). Run scripts/billing/setup-stripe.mjs.`,
      "BILLING_NOT_SET_UP",
      503
    );
  }

  catalog = { priceIds, vatRateId: vat.id, portalId: portal?.id ?? null };

  return catalog;
}

// ------------------------------------------------------
// Customer
// ------------------------------------------------------

async function ownerEmail(businessId) {
  const owner = await prisma.user.findFirst({
    where: { businessId, role: "OWNER" },
    orderBy: { createdAt: "asc" },
    select: { email: true },
  });

  return owner?.email ?? null;
}

async function ensureCustomer(business) {
  const client = requireBilling();

  if (business.stripeCustomerId) {
    return business.stripeCustomerId;
  }

  const base = {
    name: business.invoiceLegalName || business.name,
    email: business.invoiceEmail || (await ownerEmail(business.id)) || undefined,
    preferred_locales: [business.language || "nl"],
    address: business.invoiceStreet
      ? {
          line1: business.invoiceStreet,
          postal_code: business.invoicePostalCode ?? undefined,
          city: business.invoiceCity ?? undefined,
          country: business.invoiceCountry || "BE",
        }
      : { country: business.invoiceCountry || "BE" },
    metadata: { businessId: business.id, slug: business.slug },
  };

  const vat = business.invoiceVatNumber?.replace(/[\s.]/g, "").toUpperCase();
  const idempotencyKey = `customer-${business.id}`;

  let customer;

  try {
    customer = await client.customers.create(
      vat ? { ...base, tax_id_data: [{ type: "eu_vat", value: vat }] } : base,
      { idempotencyKey }
    );
  } catch (error) {
    // A VAT number Stripe refuses must not block billing.
    if (!vat || !/tax_id/i.test(`${error.code} ${error.param}`)) {
      throw error;
    }

    customer = await client.customers.create(base, {
      idempotencyKey: `${idempotencyKey}-novat`,
    });
  }

  await prisma.business.update({
    where: { id: business.id },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

// ------------------------------------------------------
// Subscription
// ------------------------------------------------------

function subscriptionFields(subscription) {
  const price = subscription.items?.data?.[0]?.price;
  const plan = fromLookupKey(price?.lookup_key);

  return {
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end || subscription.cancel_at),
    ...(plan && { billingPlan: plan.planId, billingInterval: plan.interval }),
  };
}

async function getBusiness(businessId) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });

  if (!business) {
    throw new NotFoundError("Business not found.");
  }

  return business;
}

/**
 * Starts a plan, or moves the running subscription to
 * another plan or interval (prorated by Stripe).
 */
export async function setPlan(businessId, { planId, interval, trial }) {
  const client = requireBilling();
  const plan = planById(planId);

  if (!plan || !["MONTH", "YEAR"].includes(interval)) {
    throw billingError("Unknown plan.", "BILLING_UNKNOWN_PLAN");
  }

  const business = await getBusiness(businessId);

  if (business.isDemo) {
    throw billingError("A demo account is never billed.", "BILLING_DEMO");
  }

  const { priceIds, vatRateId } = await loadCatalog();
  const price = priceIds[lookupKey(plan.id, interval)];

  const current =
    business.stripeSubscriptionId &&
    (await client.subscriptions.retrieve(business.stripeSubscriptionId).catch(() => null));

  let subscription;

  if (current && !["canceled", "incomplete_expired"].includes(current.status)) {
    subscription = await client.subscriptions.update(current.id, {
      items: [{ id: current.items.data[0].id, price }],
      proration_behavior: "create_prorations",
      cancel_at_period_end: false,
      metadata: { businessId },
    });
  } else {
    const customer = await ensureCustomer(business);
    const everSubscribed = Boolean(business.stripeSubscriptionId);

    subscription = await client.subscriptions.create(
      {
        customer,
        items: [{ price }],
        default_tax_rates: [vatRateId],
        collection_method: "charge_automatically",
        payment_settings: { save_default_payment_method: "on_subscription" },
        // Without a card when the trial ends: an open invoice
        // and past_due, never a cancelled subscription.
        trial_settings: { end_behavior: { missing_payment_method: "create_invoice" } },
        ...(trial && !everSubscribed && { trial_period_days: TRIAL_DAYS }),
        metadata: { businessId },
      },
      // Same click twice within a minute: one subscription.
      { idempotencyKey: `subscription-${businessId}-${price}-${Math.floor(Date.now() / 60_000)}` }
    );
  }

  return prisma.business.update({
    where: { id: businessId },
    data: subscriptionFields(subscription),
  });
}

/**
 * Ends the subscription at the end of the paid period.
 */
export async function cancelPlan(businessId) {
  const client = requireBilling();
  const business = await getBusiness(businessId);

  if (!business.stripeSubscriptionId) {
    throw billingError("No subscription.", "BILLING_NO_SUBSCRIPTION");
  }

  const subscription = await client.subscriptions.update(business.stripeSubscriptionId, {
    cancel_at_period_end: true,
  });

  return prisma.business.update({
    where: { id: businessId },
    data: subscriptionFields(subscription),
  });
}

/**
 * A link to Stripe's customer portal for the owner.
 */
export async function portalUrl(businessId) {
  const client = requireBilling();
  const business = await getBusiness(businessId);

  if (!business.stripeCustomerId) {
    throw billingError("No subscription yet.", "BILLING_NO_SUBSCRIPTION", 409);
  }

  const { portalId } = await loadCatalog();

  const session = await client.billingPortal.sessions.create({
    customer: business.stripeCustomerId,
    return_url: env.billingReturnUrl,
    locale: business.language === "fr" ? "fr" : business.language === "en" ? "en" : "nl",
    ...(portalId && { configuration: portalId }),
  });

  return session.url;
}

// ------------------------------------------------------
// Overage
// ------------------------------------------------------

/**
 * Bills the extra minutes and SMS of one month for every
 * billable business (or one). Safe to run again: one
 * invoice per business and month (BillingInvoice), and
 * Stripe calls carry idempotency keys.
 *
 * Returns [{ businessId, name, extraCents, invoiceId,
 * skipped }].
 */
export async function runOverage(month, { businessId, log } = {}) {
  const client = requireBilling();
  const { end } = monthRange(month);

  if (end > new Date()) {
    throw billingError("That month is not over yet.", "BILLING_MONTH_OPEN");
  }

  const businesses = await prisma.business.findMany({
    where: {
      stripeSubscriptionId: { not: null },
      isDemo: false,
      ...(businessId && { id: businessId }),
    },
  });

  const results = [];

  for (const business of businesses.filter(isBillable)) {
    try {
      results.push(await overageFor(client, business, month));
    } catch (error) {
      log?.warn?.({ businessId: business.id, month, error: error.message }, "Overage invoice failed");
      results.push({ businessId: business.id, name: business.name, error: error.message });
    }
  }

  return results;
}

async function overageFor(client, business, month) {
  const done = await prisma.billingInvoice.findUnique({
    where: { businessId_usageMonth: { businessId: business.id, usageMonth: month } },
  });

  if (done?.stripeInvoiceId) {
    return { businessId: business.id, name: business.name, skipped: "already invoiced", invoiceId: done.stripeInvoiceId };
  }

  const records = await usageService.monthRecords(month, business.id);
  const summary = summarizeUsage(records, business);
  const lines = overageLines(summary, monthLabel(month, business.language || "nl"));

  if (lines.length === 0) {
    return { businessId: business.id, name: business.name, extraCents: 0, skipped: "nothing extra" };
  }

  const { vatRateId } = await loadCatalog();

  // Claim the month first, so two runs never make two
  // invoices. A claim without a Stripe id (a crash in
  // between) is picked up again; the idempotency keys make
  // Stripe return what it already made.
  const claim =
    done ??
    (await prisma.billingInvoice.create({
      data: {
        businessId: business.id,
        kind: "OVERAGE",
        usageMonth: month,
        status: "draft",
        issuedAt: new Date(),
        extraMinutes: summary.extraMinutes,
        extraSms: summary.extraSms,
      },
    }));

  const key = `overage-${business.id}-${month}`;

  const subscription = await client.subscriptions
    .retrieve(business.stripeSubscriptionId)
    .catch(() => null);

  const draft = await client.invoices.create(
    {
      customer: business.stripeCustomerId,
      collection_method: "charge_automatically",
      auto_advance: true,
      pending_invoice_items_behavior: "exclude",
      default_tax_rates: [vatRateId],
      description: `Extra verbruik ${monthLabel(month, business.language || "nl")}`,
      ...(subscription?.default_payment_method && {
        default_payment_method:
          typeof subscription.default_payment_method === "string"
            ? subscription.default_payment_method
            : subscription.default_payment_method.id,
      }),
      metadata: { businessId: business.id, usageMonth: month, kind: "OVERAGE" },
    },
    { idempotencyKey: `${key}-invoice` }
  );

  for (const line of lines) {
    await client.invoiceItems.create(
      {
        customer: business.stripeCustomerId,
        invoice: draft.id,
        currency: "eur",
        amount: line.amountCents,
        description: line.description,
        metadata: { businessId: business.id, usageMonth: month, line: line.key },
      },
      { idempotencyKey: `${key}-${line.key}` }
    );
  }

  const invoice =
    draft.status === "draft"
      ? await client.invoices.finalizeInvoice(draft.id, { auto_advance: true })
      : draft;

  await prisma.billingInvoice.update({
    where: { id: claim.id },
    data: { ...invoiceFields(invoice), extraMinutes: summary.extraMinutes, extraSms: summary.extraSms },
  });

  return {
    businessId: business.id,
    name: business.name,
    extraCents: summary.extraCents,
    invoiceId: invoice.id,
  };
}

// ------------------------------------------------------
// Webhook
// ------------------------------------------------------

function invoiceFields(invoice) {
  const total = invoice.total ?? 0;
  const excluding = invoice.total_excluding_tax ?? total;

  return {
    stripeInvoiceId: invoice.id,
    number: invoice.number ?? null,
    status: invoice.status ?? "draft",
    subtotalCents: excluding,
    taxCents: total - excluding,
    totalCents: total,
    currency: invoice.currency ?? "eur",
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    issuedAt: new Date((invoice.status_transitions?.finalized_at ?? invoice.created) * 1000),
    paidAt: invoice.status_transitions?.paid_at
      ? new Date(invoice.status_transitions.paid_at * 1000)
      : null,
  };
}

async function businessForCustomer(customerId, metadata) {
  if (metadata?.businessId) {
    const business = await prisma.business.findUnique({ where: { id: metadata.businessId } });

    if (business) {
      return business;
    }
  }

  return customerId
    ? prisma.business.findUnique({ where: { stripeCustomerId: customerId } })
    : null;
}

/**
 * Checks Stripe's signature; throws when it is wrong.
 */
export function verifyWebhook(rawBody, signature) {
  if (!stripe || !env.stripeBillingWebhookSecret) {
    throw billingError("Billing webhook is not configured.", "BILLING_WEBHOOK_OFF", 503);
  }

  try {
    return stripe.webhooks.constructEvent(rawBody, signature, env.stripeBillingWebhookSecret);
  } catch {
    throw billingError("Invalid signature.", "BILLING_BAD_SIGNATURE", 400);
  }
}

export async function handleWebhookEvent(event, log) {
  const object = event.data?.object ?? {};

  if (event.type.startsWith("customer.subscription.")) {
    const business = await businessForCustomer(object.customer, object.metadata);

    if (!business) {
      log?.warn?.({ subscription: object.id }, "Billing webhook: unknown customer");
      return { handled: false };
    }

    // An old subscription must not overwrite a newer one.
    if (business.stripeSubscriptionId && business.stripeSubscriptionId !== object.id) {
      return { handled: false };
    }

    await prisma.business.update({
      where: { id: business.id },
      data: subscriptionFields(object),
    });

    return { handled: true };
  }

  if (event.type.startsWith("invoice.")) {
    const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
    const business = await businessForCustomer(customerId, object.metadata);

    if (!business) {
      log?.warn?.({ invoice: object.id }, "Billing webhook: unknown customer");
      return { handled: false };
    }

    const fields = invoiceFields(object);
    const usageMonth = object.metadata?.kind === "OVERAGE" ? object.metadata.usageMonth : null;

    // The overage claim row has no Stripe id until the
    // invoice is made; an early webhook fills it in.
    if (usageMonth) {
      await prisma.billingInvoice.upsert({
        where: { businessId_usageMonth: { businessId: business.id, usageMonth } },
        create: { businessId: business.id, kind: "OVERAGE", usageMonth, ...fields },
        update: fields,
      });
    } else {
      await prisma.billingInvoice.upsert({
        where: { stripeInvoiceId: object.id },
        create: { businessId: business.id, kind: "SUBSCRIPTION", ...fields },
        update: fields,
      });
    }

    return { handled: true };
  }

  return { handled: false };
}

export const OVERAGE_DAYS = OVERAGE_LAST_DAY;
