import specialOpeningDayController from "./special-opening-day.controller.js";
import { authenticate } from "../../../middleware/auth.middleware.js";
import {
  requireRestaurantOwnership,
} from "../../../middleware/restaurant-ownership.middleware.js";

// ======================================================
// Special Opening Day Routes
// ======================================================
//
// Dashboard routes are protected by:
//
// 1. JWT authentication
// 2. Restaurant ownership
//
// These routes are NOT VAPI routes.
// ======================================================

export default async function specialOpeningDayRoutes(
  fastify
) {
  /**
   * Retrieves all special opening days
   * for the authenticated restaurant.
   */
  fastify.get(
    "/:restaurantId/special-opening-days",
    {
      preHandler: [
        authenticate,
        requireRestaurantOwnership,
      ],
    },
    specialOpeningDayController.findByRestaurant
  );

  /**
   * Creates a new special opening day
   * for the authenticated restaurant.
   */
  fastify.post(
    "/:restaurantId/special-opening-days",
    {
      preHandler: [
        authenticate,
        requireRestaurantOwnership,
      ],
    },
    specialOpeningDayController.create
  );

  /**
   * Updates an existing special opening day.
   */
  fastify.put(
    "/:restaurantId/special-opening-days/:id",
    {
      preHandler: [
        authenticate,
        requireRestaurantOwnership,
      ],
    },
    specialOpeningDayController.update
  );

  /**
   * Deletes an existing special opening day.
   */
  fastify.delete(
    "/:restaurantId/special-opening-days/:id",
    {
      preHandler: [
        authenticate,
        requireRestaurantOwnership,
      ],
    },
    specialOpeningDayController.delete
  );
}