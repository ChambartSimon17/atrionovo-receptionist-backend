import specialOpeningDayController from "./special-opening-day.controller.js";

// ======================================================
// Special Opening Day Routes
// ======================================================
//
// Responsibility
// Register HTTP routes related to a restaurant's
// special opening days.
// ======================================================

export default async function specialOpeningDayRoutes(fastify) {
  /**
   * Retrieves all special opening days
   * for a restaurant.
   */
  fastify.get(
    "/restaurants/:restaurantId/special-opening-days",
    specialOpeningDayController.findByRestaurant
  );

  /**
   * Creates a new special opening day.
   */
  fastify.post(
    "/restaurants/:restaurantId/special-opening-days",
    specialOpeningDayController.create
  );

  /**
   * Updates an existing special opening day.
   */
  fastify.put(
    "/restaurants/:restaurantId/special-opening-days/:id",
    specialOpeningDayController.update
  );

  /**
   * Deletes a special opening day.
   */
  fastify.delete(
    "/restaurants/:restaurantId/special-opening-days/:id",
    specialOpeningDayController.delete
  );
}