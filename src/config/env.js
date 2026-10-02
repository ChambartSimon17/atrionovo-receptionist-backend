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
};

// Named export
export { env };

// Default export
export default env;