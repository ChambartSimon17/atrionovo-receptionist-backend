import openingHourController from "./opening-hour.controller.js";

// ======================================================
// Opening Hour Routes
// ======================================================
//
// Responsibility
// Define all HTTP routes related to a restaurant's
// weekly opening schedule.
// ======================================================

export default async function openingHourRoutes(fastify) {
  fastify.put(
    "/:restaurantId/opening-hours",
    openingHourController.replaceSchedule
  );
}