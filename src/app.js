import Fastify from "fastify";
import cors from "@fastify/cors";

import healthRoutes from "./system/health.routes.js";

import businessRoutes from "./modules/business/business.routes.js";

import openingHourRoutes from "./modules/business/opening-hours/opening-hour.routes.js";

import specialOpeningDayRoutes from "./modules/business/special-opening-days/special-opening-day.routes.js";

import tableRoutes from "./modules/business/table/table.routes.js";

import massageServiceRoutes from "./modules/massage-service/massage-service.routes.js";

import therapistRoutes from "./modules/therapist/therapist.routes.js";

import treatmentRoomRoutes from "./modules/treatment-room/treatment-room.routes.js";

import massageAppointmentRoutes from "./modules/massage-appointment/massage-appointment.routes.js";

import customerRoutes from "./modules/customer/customer.routes.js";

import reservationRoutes from "./modules/reservation/reservation.routes.js";

import publicBookingRoutes
  from "./modules/public-booking/public-booking.routes.js";

import assistantRoutes from "./modules/assistant/assistant.routes.js";

import authRoutes from "./modules/auth/auth.routes.js";

import floorOperationsRoutes from "./modules/floor-operations/floor-operations.routes.js";

import {
  callEventRoutes,
  insightsBusinessRoutes,
  pushTokenRoutes,
} from "./modules/insights/insights.routes.js";

import teamRoutes from "./modules/team/team.routes.js";

import {
  paymentBusinessRoutes,
  paymentPageRoutes,
} from "./modules/payment/payment.routes.js";

import invoicingRoutes from "./modules/invoicing/invoicing.routes.js";

import websiteRoutes from "./modules/website/website.routes.js";

import liveDemoRoutes from "./modules/live-demo/live-demo.routes.js";

import errorHandler from "./middleware/error.middleware.js";

import {
  LEGACY_RESTAURANT_ROUTE_PREFIX,
  registerLegacyRestaurantCompat,
} from "./middleware/legacy-restaurant-compat.js";

const app = Fastify({
  logger: true,
});

app.register(cors, {
  origin: [
    "http://localhost:5173",
    "https://booking.atrionovo.com",
    "https://atrionovo.com",
    "https://www.atrionovo.com",
    "http://localhost:4321",
  ],
});

// Must be registered before the routes so every route
// inherits the hooks.
registerLegacyRestaurantCompat(app);

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

app.register(massageServiceRoutes, {
  prefix: "/businesses",
});

app.register(therapistRoutes, {
  prefix: "/businesses",
});

app.register(treatmentRoomRoutes, {
  prefix: "/businesses",
});

app.register(massageAppointmentRoutes, {
  prefix: "/businesses",
});

app.register(floorOperationsRoutes, {
  prefix: "/businesses",
});

app.register(insightsBusinessRoutes, {
  prefix: "/businesses",
});

app.register(teamRoutes, {
  prefix: "/businesses",
});

app.register(paymentBusinessRoutes, {
  prefix: "/businesses",
});

app.register(invoicingRoutes, {
  prefix: "/businesses",
});

app.register(paymentPageRoutes, {
  prefix: "/payments",
});

// Legacy aliases (temporary).
//
// App builds from before the rename still call /restaurants/...
// See middleware/legacy-restaurant-compat.js.

app.register(businessRoutes, {
  prefix: LEGACY_RESTAURANT_ROUTE_PREFIX,
});

app.register(openingHourRoutes, {
  prefix: LEGACY_RESTAURANT_ROUTE_PREFIX,
});

app.register(specialOpeningDayRoutes, {
  prefix: LEGACY_RESTAURANT_ROUTE_PREFIX,
});

app.register(tableRoutes, {
  prefix: LEGACY_RESTAURANT_ROUTE_PREFIX,
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

app.register(websiteRoutes, {
  prefix: "/public",
});

app.register(liveDemoRoutes, {
  prefix: "/public/live-demo",
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

app.register(callEventRoutes, {
  prefix: "/assistant",
});

// ======================================================
// Authentication
// ======================================================

app.register(authRoutes, {
  prefix: "/auth",
});

app.register(pushTokenRoutes, {
  prefix: "/auth",
});

// ======================================================
// Error Handling
// ======================================================

app.setErrorHandler(errorHandler);

export default app;