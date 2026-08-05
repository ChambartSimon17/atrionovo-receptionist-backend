import specialOpeningDayController from "./special-opening-day.controller.js";

// ======================================================
// Special Opening Day Routes
// ======================================================
//
// Responsibility
// Register HTTP routes related to a restaurant's
// special opening days.
// ======================================================

export default async function specialOpeningDayRoutes(
  fastify
) {
  /**
   * Retrieves all special opening days
   * for a restaurant.
   */
  fastify.get(
    "/:restaurantId/special-opening-days",
    specialOpeningDayController.findByRestaurant
  );

  /**
   * Creates a new special opening day.
   */
  fastify.post(
    "/:restaurantId/special-opening-days",
    specialOpeningDayController.create
  );

  /**
   * Updates an existing special opening day.
   */
  fastify.put(
    "/:restaurantId/special-opening-days/:id",
    specialOpeningDayController.update
  );

  /**
   * Deletes a special opening day.
   */
  fastify.delete(
    "/:restaurantId/special-opening-days/:id",
    specialOpeningDayController.delete
  );
}