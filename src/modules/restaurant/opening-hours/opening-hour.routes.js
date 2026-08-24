import openingHourController from "./opening-hour.controller.js";
import { authenticate } from "../../../middleware/auth.middleware.js";
import {
  requireRestaurantOwnership,
} from "../../../middleware/restaurant-ownership.middleware.js";

// ======================================================
// Opening Hour Routes
// ======================================================
//
// Dashboard routes are protected by:
//
// 1. JWT authentication
// 2. Restaurant ownership
//
// These routes are NOT VAPI routes.
// ======================================================

export default async function openingHourRoutes(
  fastify
) {
  fastify.put(
    "/:restaurantId/opening-hours",
    {
      preHandler: [
        authenticate,
        requireRestaurantOwnership,
      ],
    },
    openingHourController.replaceSchedule
  );
}