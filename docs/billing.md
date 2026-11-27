# Billing, metering and the usage report

What each business pays AtrioNovo, what its calls and SMS cost us, and a report of both.
Code: `src/modules/billing/` (metering, Stripe) and `src/modules/admin/` (report).

## What is counted

| What | Where it comes from | Cost |
| --- | --- | --- |
| Call | Vapi's end-of-call report (`/assistant/call-events`) | Vapi's `cost` in USD |
| Confirmation SMS | the backend after a call (Twilio) | Twilio's price, fetched later |
| Live demo on the website | the live-demo module | our own cost, never billed |

Each becomes one `UsageRecord`. Costs Vapi or Twilio don't report right away are fetched
once an hour for a week (`billing.scheduler.js`); until then the report shows an estimate (≈).

Rules:

- A month is a calendar month in Europe/Brussels.
- Minutes: all seconds of the month added up and rounded up once at the end.
- SMS: one per message, however many segments.
- Usage during the free trial never counts as extra.

## Plans

`src/modules/billing/plans.js`, the same as atrionovo.com/prijzen: Start €79 / 200 min / 100 SMS,
Pro €149 / 450 / 200, Groei €249 / 900 / 300; extra €0.25 per minute and €0.12 per SMS; yearly =
11 months. No VAT while `BILLING_VAT_EXEMPT` is on (small-business exemption); otherwise
excluding 21% VAT. Change the website and this file together.

## Switching it on

Metering and the report work right away. Stripe stays off until step 4.

1. **Report.** In Render, set `ADMIN_PASSWORD` (at least 16 characters, e.g. `openssl rand -base64 24`).
   Open `/admin` on the backend; any user name, that password.
2. **Fill the history** (production database, read-only at Vapi):
   `node scripts/billing/backfill-usage.mjs --db-env=.env.render` (dry run), then add `--apply --costs`.
   It also marks the demo accounts from `scripts/demo/demos/` as demos (never the customers in
   `vapi/customers.json`).
3. **Stripe test mode first.** With a test key (`sk_test_...`) in `.env`:
   `node scripts/billing/setup-stripe.mjs` creates the products, prices, VAT rate and customer portal.
   Add `--webhook=<url>/billing/webhook` to create the webhook; it prints the signing secret once
   (or writes it to a file with `--secret-file=<path>`).
4. **Live.** In Render: `STRIPE_BILLING_WEBHOOK_SECRET` (from step 3 in live mode) and
   `STRIPE_BILLING_ENABLED=true`. Run step 3 with the live key and `--live`.

Then, per customer, on `/admin/businesses/<id>`: choose a plan and start the subscription (with or
without a 14-day trial). The owner adds a card through **Meer → Abonnement → Betaling en facturen
beheren** in the app (Stripe's customer portal).

## Settings

| Variable | Default | What |
| --- | --- | --- |
| `STRIPE_BILLING_ENABLED` | off | `true`: subscriptions and overage invoices in Stripe |
| `STRIPE_BILLING_WEBHOOK_SECRET` | – | signing secret of `/billing/webhook` |
| `ADMIN_PASSWORD` | – | without it (or shorter than 16) `/admin` does not exist |
| `BILLING_VAT_EXEMPT` | on | small-business exemption: no VAT on invoices; `false` adds 21% |
| `BILLING_RETURN_URL` | `https://app.atrionovo.com` | where the Stripe portal sends the owner back |
| `BILLING_USD_TO_EUR` | `0.86` | euro per dollar for Vapi and Twilio costs |
| `CALL_COST_ESTIMATE_EUR_PER_MINUTE` | `0.15` | estimate until Vapi reports the cost |
| `SMS_COST_ESTIMATE_EUR_PER_SEGMENT` | `0.08` | estimate until Twilio reports the price |

## Unpaid

A trial that ends without a card, or a payment that fails: Stripe leaves the subscription
`past_due` (invoice open, Stripe retries and mails). The receptionist keeps answering. The account
is red in `/admin`, and the app shows "Betaling mislukt" in Meer.

## Overage invoices

From the 1st (03:00 Brussels) to the 7th of each month, every hour: the extra minutes and SMS of the
month before go on an invoice of their own, charged to the card on file. One invoice per business and
month (`BillingInvoice.usageMonth`); runs again are skipped. `/admin` has a button to run it by hand.

## Not in the cost (yet)

Fixed costs: the Vapi/Twilio phone numbers per month, Render, Stripe fees.
