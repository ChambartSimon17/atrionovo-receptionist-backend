import Fastify from "fastify";

import healthRoutes from "./system/health.routes.js";

import restaurantRoutes from "./modules/restaurant/restaurant.routes.js";

import openingHourRoutes from "./modules/restaurant/opening-hours/opening-hour.routes.js";

import specialOpeningDayRoutes from "./modules/restaurant/special-opening-days/special-opening-day.routes.js";

import tableRoutes from "./modules/restaurant/table/table.routes.js";

import customerRoutes from "./modules/customer/customer.routes.js";

import reservationRoutes from "./modules/reservation/reservation.routes.js";

import assistantRoutes from "./modules/assistant/assistant.routes.js";

import authRoutes from "./modules/auth/auth.routes.js";

import errorHandler from "./middleware/error.middleware.js";

const app = Fastify({
  logger: true,
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
// Restaurant
// ======================================================

app.register(restaurantRoutes, {
  prefix: "/restaurants",
});

app.register(openingHourRoutes, {
  prefix: "/restaurants",
});

app.register(specialOpeningDayRoutes, {
  prefix: "/restaurants",
});

app.register(tableRoutes, {
  prefix: "/restaurants",
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