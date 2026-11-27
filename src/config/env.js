import "dotenv/config";

// ======================================================
// Environment Configuration
// ======================================================
//
// Centralized access to environment variables.
// ======================================================

const env = {
  // Application
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV,

  // Database
  databaseUrl: process.env.DATABASE_URL,

  // JWT
  jwtAccessSecret:
    process.env.JWT_ACCESS_SECRET,

  jwtRefreshSecret:
    process.env.JWT_REFRESH_SECRET,

  // VAPI
  vapiApiKey:
    process.env.VAPI_API_KEY,

  vapiPhoneNumberId:
    process.env.VAPI_PHONE_NUMBER_ID,

  // Shared secret Vapi sends with every assistant-request
  // and tool call (header x-vapi-secret). Set it on the
  // tools and numbers with `npm run vapi:sync`.
  vapiServerSecret:
    process.env.VAPI_SERVER_SECRET,

  // Template assistant per business type. The incoming call
  // gets one of these, filled with the business's values
  // (see src/modules/vapi/assistant-request.js).
  vapiAssistantRestaurant:
    process.env.VAPI_ASSISTANT_RESTAURANT,

  vapiAssistantMassage:
    process.env.VAPI_ASSISTANT_MASSAGE,

  // Optional: a generic assistant for calls we cannot place
  // (unknown number, database down) and that have no
  // fallback number.
  vapiAssistantFallback:
    process.env.VAPI_ASSISTANT_FALLBACK,

  // Our own deadline for assistant-request. Vapi waits at
  // most 7.5 s (fixed), so we answer with the fallback well
  // before that.
  vapiAssistantRequestDeadlineMs:
    Number(process.env.VAPI_ASSISTANT_REQUEST_DEADLINE_MS || 5000),

  // How long a business found by phone number stays in
  // memory (assistant-request and tool calls).
  vapiBusinessCacheSeconds:
    Number(process.env.VAPI_BUSINESS_CACHE_SECONDS || 120),

  // TEST ONLY: make assistant-request fail on purpose to
  // test the fallback on the Vapi number.
  //   "error" -> answer with HTTP 500
  //   "hang"  -> never answer (Vapi gives up after 7.5 s)
  vapiSimulateAssistantRequestFailure:
    process.env.VAPI_SIMULATE_ASSISTANT_REQUEST_FAILURE,

  // Google
  googleClientId:
    process.env.GOOGLE_CLIENT_ID,

  googleClientSecret:
    process.env.GOOGLE_CLIENT_SECRET,

  // Twilio
  twilioAccountSid:
    process.env.TWILIO_ACCOUNT_SID,

  twilioAuthToken:
    process.env.TWILIO_AUTH_TOKEN,

  // Stripe (payments; without a key only cash and
  // terminal payments work)
  stripeSecretKey:
    process.env.STRIPE_SECRET_KEY,

  // Mail (Resend): kastickets and invoices
  resendApiKey:
    process.env.RESEND_API_KEY,

  mailFrom:
    process.env.MAIL_FROM || "facturen@mail.atrionovo.com",

  // Where demo requests from atrionovo.com are mailed.
  demoInbox:
    process.env.DEMO_INBOX || "simon@atrionovo.com",

  // Live demo on atrionovo.com: Google Places finds the
  // business, Twilio sends the confirmation text. Without
  // a Google key the demo is switched off.
  googleMapsApiKey:
    process.env.GOOGLE_MAPS_API_KEY,

  twilioSmsFrom:
    process.env.TWILIO_SMS_FROM || "AtrioNovo",

  // The Vapi number the demo calls from. Best a number of
  // its own, so demo callers never call back into a real
  // business. Falls back to VAPI_PHONE_NUMBER_ID.
  liveDemoPhoneNumberId:
    process.env.LIVE_DEMO_PHONE_NUMBER_ID || process.env.VAPI_PHONE_NUMBER_ID,

  liveDemoModel:
    process.env.LIVE_DEMO_MODEL || "gpt-4.1",

  liveDemoDailyCalls:
    Number(process.env.LIVE_DEMO_DAILY_CALLS || 40),

  // Peppol (e-invoice.be)
  einvoiceApiKey:
    process.env.EINVOICE_API_KEY,

  // Calendar sync (iCloud CalDAV, ICS feeds).
  // The key encrypts app passwords and ICS links in the
  // database. The iCloud account is only the default for
  // the setup script; each business stores its own.
  calendarEncryptionKey:
    process.env.CALENDAR_ENCRYPTION_KEY,

  icloudUsername:
    process.env.ICLOUD_USERNAME,

  icloudAppPassword:
    process.env.ICLOUD_APP_PASSWORD,

  calendarSyncIntervalMinutes:
    Number(process.env.CALENDAR_SYNC_INTERVAL_MINUTES || 5),

  // Public address of this backend, for the pages Stripe
  // sends customers and owners back to.
  publicBaseUrl:
    process.env.PUBLIC_BASE_URL ||
    "https://atrionovo-receptionist-backend.onrender.com",

  // ----------------------------------------------------
  // AtrioNovo billing (src/modules/billing)
  // ----------------------------------------------------

  // Off by default: without "true" nothing is created or
  // charged in Stripe (no subscriptions, no overage
  // invoices). Usage is metered and reported either way.
  // Uses STRIPE_SECRET_KEY, the same account as Connect.
  stripeBillingEnabled:
    process.env.STRIPE_BILLING_ENABLED === "true",

  // Signing secret of the Stripe webhook to
  // /billing/webhook (whsec_...).
  stripeBillingWebhookSecret:
    process.env.STRIPE_BILLING_WEBHOOK_SECRET,

  // Small-business VAT exemption (vrijstellingsregeling
  // kleine ondernemingen): no VAT on subscriptions and
  // overage invoices, the plan price is what is paid. On by
  // default; set "false" once registered for VAT, then 21%
  // is added (the rate setup-stripe.mjs made).
  billingVatExempt:
    process.env.BILLING_VAT_EXEMPT !== "false",

  // Where the Stripe customer portal sends the owner back.
  billingReturnUrl:
    process.env.BILLING_RETURN_URL || "https://app.atrionovo.com",

  // Our own usage report at /admin. Without a password of
  // at least 16 characters the admin pages do not exist.
  adminPassword:
    process.env.ADMIN_PASSWORD,

  // Euro per US dollar, for Vapi and Twilio costs.
  usdToEur:
    Number(process.env.BILLING_USD_TO_EUR || 0.86),

  // Estimates when a provider did not report a cost yet.
  callCostEstimateEurPerMinute:
    Number(process.env.CALL_COST_ESTIMATE_EUR_PER_MINUTE || 0.15),

  smsCostEstimateEurPerSegment:
    Number(process.env.SMS_COST_ESTIMATE_EUR_PER_SEGMENT || 0.08),
};

// Named export
export { env };

// Default export
export default env;