import specialOpeningDayController from "./special-opening-day.controller.js";
import { authenticate } from "../../../middleware/auth.middleware.js";
import {
  requireBusinessOwnership,
} from "../../../middleware/business-ownership.middleware.js";

// ======================================================
// Special Opening Day Routes
// ======================================================
//
// Dashboard routes are protected by:
//
// 1. JWT authentication
// 2. Business ownership
//
// These routes are NOT VAPI routes.
// ======================================================

export default async function specialOpeningDayRoutes(
  fastify
) {
  /**
   * Retrieves all special opening days
   * for the authenticated business.
   */
  fastify.get(
    "/:businessId/special-opening-days",
    {
      preHandler: [
        authenticate,
        requireBusinessOwnership,
      ],
    },
    specialOpeningDayController.findByBusiness
  );

  /**
   * Creates a new special opening day
   * for the authenticated business.
   */
  fastify.post(
    "/:businessId/special-opening-days",
    {
      preHandler: [
        authenticate,
        requireBusinessOwnership,
      ],
    },
    specialOpeningDayController.create
  );

  /**
   * Updates an existing special opening day.
   */
  fastify.put(
    "/:businessId/special-opening-days/:id",
    {
      preHandler: [
        authenticate,
        requireBusinessOwnership,
      ],
    },
    specialOpeningDayController.update
  );

  /**
   * Deletes an existing special opening day.
   */
  fastify.delete(
    "/:businessId/special-opening-days/:id",
    {
      preHandler: [
        authenticate,
        requireBusinessOwnership,
      ],
    },
    specialOpeningDayController.delete
  );
}