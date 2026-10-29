import Fastify from "fastify";
import cors from "@fastify/cors";

import healthRoutes from "./system/health.routes.js";

import businessRoutes from "./modules/business/business.routes.js";

import openingHourRoutes from "./modules/business/opening-hours/opening-hour.routes.js";

import specialOpeningDayRoutes from "./modules/business/special-opening-days/special-opening-day.routes.js";

import tableRoutes from "./modules/business/table/table.routes.js";

import customerRoutes from "./modules/customer/customer.routes.js";

import reservationRoutes from "./modules/reservation/reservation.routes.js";

import publicBookingRoutes
  from "./modules/public-booking/public-booking.routes.js";

import assistantRoutes from "./modules/assistant/assistant.routes.js";

import authRoutes from "./modules/auth/auth.routes.js";

import errorHandler from "./middleware/error.middleware.js";

const app = Fastify({
  logger: true,
});

app.register(cors, {
  origin: [
    "http://localhost:5173",
    "https://booking.atrionovo.com",
  ],
});

app.get("/", async () => {
  return {
    status: "OK",
    message: "AtrioNovo backend is running",
  };
});

// ======================================================
// System
// ======================================================

app.register(healthRoutes);

// ======================================================
// Business
// ======================================================

app.register(businessRoutes, {
  prefix: "/businesses",
});

app.register(openingHourRoutes, {
  prefix: "/businesses",
});

app.register(specialOpeningDayRoutes, {
  prefix: "/businesses",
});

app.register(tableRoutes, {
  prefix: "/businesses",
});

// ======================================================
// Customer
// ======================================================

app.register(customerRoutes, {
  prefix: "/customers",
});

// ======================================================
// Reservation
// ======================================================

app.register(reservationRoutes, {
  prefix: "/reservations",
});

app.register(publicBookingRoutes, {
  prefix: "/public/booking",
});

// ======================================================
// Assistant
// ======================================================

app.register(assistantRoutes, {
  prefix: "/assistant",
});

// ======================================================
// Authentication
// ======================================================

app.register(authRoutes, {
  prefix: "/auth",
});

// ======================================================
// Error Handling
// ======================================================

app.setErrorHandler(errorHandler);

export default app;