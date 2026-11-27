// Sets up AtrioNovo billing in Stripe, once per Stripe mode (test, live).
// Safe to run again: what exists is found and kept (prices by lookup key,
// the VAT rate and the portal by metadata).
//
// Makes:
//   - a product per plan (atrionovo_start, _pro, _groei) with a monthly
//     and a yearly price (lookup keys atrionovo_<plan>_month / _year)
//   - the 21% Belgian VAT rate (metadata atrionovo=vat_be_21)
//   - the customer portal: card, invoices, billing details, change plan,
//     cancel at the end of the period (metadata atrionovo=portal)
//   - with --webhook=<url>: the webhook endpoint for /billing/webhook.
//     Prints its signing secret ONCE: put it in Render as
//     STRIPE_BILLING_WEBHOOK_SECRET. With --secret-file=<path> it is
//     written to that file (only you can read it) instead of printed.
//
// Usage:
//   node scripts/billing/setup-stripe.mjs                    (key from .env)
//   node scripts/billing/setup-stripe.mjs --env=.env.render
//   node scripts/billing/setup-stripe.mjs --webhook=https://atrionovo-receptionist-backend.onrender.com/billing/webhook
//   node scripts/billing/setup-stripe.mjs --dry-run
//
// A live key (sk_live_ / rk_live_) is refused unless you add --live.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import Stripe from "stripe";

import { PLANS, lookupKey, priceCents, VAT_PERCENT } from "../../src/modules/billing/plans.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const flag = (name) => args.includes(`--${name}`);

const envFile = option("env") ?? ".env";
const { STRIPE_SECRET_KEY: key } = dotenv.parse(readFileSync(join(ROOT, envFile)));

if (!key) throw new Error(`Geen STRIPE_SECRET_KEY in ${envFile}`);

const live = /^(sk|rk)_live_/.test(key);
if (live && !flag("live")) throw new Error("Dit is een LIVE Stripe-sleutel. Voeg --live toe als dat de bedoeling is.");

const dryRun = flag("dry-run");
const stripe = new Stripe(key);

console.log(`Stripe ${live ? "LIVE" : "test"}${dryRun ? " (dry run, niets aangemaakt)" : ""}\n`);

async function step(label, existing, create) {
  if (existing) {
    console.log(`= ${label}`);
    return existing;
  }

  if (dryRun) {
    console.log(`+ ${label} (zou aangemaakt worden)`);
    return null;
  }

  const made = await create();
  console.log(`+ ${label}`);
  return made;
}

// Products and prices
const products = {};

for (const plan of Object.values(PLANS)) {
  const id = `atrionovo_${plan.id.toLowerCase()}`;
  const found = await stripe.products.retrieve(id).catch(() => null);

  products[plan.id] = await step(`product ${plan.name}`, found, () =>
    stripe.products.create({
      id,
      name: `AtrioNovo ${plan.name}`,
      description: `AI-receptionist met ${plan.includedMinutes} belminuten en ${plan.includedSms} sms per maand, agenda en app.`,
      metadata: { atrionovo_plan: plan.id },
    })
  );

  for (const interval of ["MONTH", "YEAR"]) {
    const lookup = lookupKey(plan.id, interval);
    const existing = (await stripe.prices.list({ lookup_keys: [lookup], limit: 1 })).data[0];

    if (existing && existing.unit_amount !== priceCents(plan, interval)) {
      console.log(`! ${lookup} bestaat met een andere prijs (${existing.unit_amount}); niet aangepast.`);
    }

    await step(`prijs ${lookup} (€ ${(priceCents(plan, interval) / 100).toFixed(2)})`, existing, () =>
      stripe.prices.create({
        product: id,
        currency: "eur",
        unit_amount: priceCents(plan, interval),
        recurring: { interval: interval === "YEAR" ? "year" : "month" },
        tax_behavior: "exclusive",
        lookup_key: lookup,
        nickname: `${plan.name} ${interval === "YEAR" ? "jaarlijks" : "maandelijks"}`,
        metadata: { atrionovo_plan: plan.id, interval },
      })
    );
  }
}

// VAT
const rates = await stripe.taxRates.list({ active: true, limit: 100 });
await step(
  `btw ${VAT_PERCENT}%`,
  rates.data.find((rate) => rate.metadata?.atrionovo === "vat_be_21"),
  () =>
    stripe.taxRates.create({
      display_name: "BTW",
      percentage: VAT_PERCENT,
      inclusive: false,
      country: "BE",
      jurisdiction: "BE",
      tax_type: "vat",
      metadata: { atrionovo: "vat_be_21" },
    })
);

// Customer portal
const portals = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
const portal = portals.data.find((config) => config.metadata?.atrionovo === "portal");

const portalSettings = async () => {
  const prices = await stripe.prices.list({
    lookup_keys: Object.values(PLANS).flatMap((plan) => [lookupKey(plan.id, "MONTH"), lookupKey(plan.id, "YEAR")]),
    limit: 20,
  });

  return {
    business_profile: {
      headline: "AtrioNovo: je abonnement en facturen",
      privacy_policy_url: "https://www.atrionovo.com/privacy",
      terms_of_service_url: "https://www.atrionovo.com/voorwaarden",
    },
    features: {
      customer_update: { enabled: true, allowed_updates: ["name", "email", "address", "tax_id"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        products: Object.values(PLANS).map((plan) => ({
          product: `atrionovo_${plan.id.toLowerCase()}`,
          prices: prices.data.filter((price) => price.product === `atrionovo_${plan.id.toLowerCase()}`).map((price) => price.id),
        })),
      },
    },
    metadata: { atrionovo: "portal" },
  };
};

if (portal) {
  if (!dryRun) await stripe.billingPortal.configurations.update(portal.id, await portalSettings());
  console.log(`= klantenportaal${dryRun ? "" : " (instellingen bijgewerkt)"}`);
} else {
  await step("klantenportaal", null, async () => stripe.billingPortal.configurations.create(await portalSettings()));
}

// Webhook
const webhookUrl = option("webhook");

if (webhookUrl) {
  const hooks = await stripe.webhookEndpoints.list({ limit: 100 });
  const found = hooks.data.find((hook) => hook.url === webhookUrl);
  const events = [
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.trial_will_end",
    "invoice.created",
    "invoice.finalized",
    "invoice.paid",
    "invoice.payment_failed",
    "invoice.voided",
    "invoice.marked_uncollectible",
    "invoice.updated",
  ];

  const made = await step(`webhook ${webhookUrl}`, found, () =>
    stripe.webhookEndpoints.create({ url: webhookUrl, enabled_events: events, description: "AtrioNovo billing" })
  );

  const secretFile = option("secret-file");

  if (made?.secret && secretFile) {
    writeFileSync(secretFile, `STRIPE_BILLING_WEBHOOK_SECRET=${made.secret}\n`, { mode: 0o600 });
    console.log(`\n  Het webhook-geheim staat in ${secretFile} (wordt maar één keer gegeven: zet het in Render).`);
  } else if (made?.secret) {
    console.log(`\n  STRIPE_BILLING_WEBHOOK_SECRET=${made.secret}\n  (wordt maar één keer getoond: zet het nu in Render)`);
  } else if (found) {
    console.log("  Bestond al: het geheim staat in het Stripe-dashboard bij deze webhook.");
  }
}

console.log("\nKlaar. Zet STRIPE_BILLING_ENABLED=true om abonnementen en extra verbruik te factureren.");
