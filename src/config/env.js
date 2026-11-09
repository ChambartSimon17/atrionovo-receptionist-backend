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
    process.env.LIVE_DEMO_MODEL || "gpt-4o",

  liveDemoDailyCalls:
    Number(process.env.LIVE_DEMO_DAILY_CALLS || 40),

  // Peppol (e-invoice.be)
  einvoiceApiKey:
    process.env.EINVOICE_API_KEY,

  // Public address of this backend, for the pages Stripe
  // sends customers and owners back to.
  publicBaseUrl:
    process.env.PUBLIC_BASE_URL ||
    "https://atrionovo-receptionist-backend.onrender.com",
};

// Named export
export { env };

// Default export
export default env;