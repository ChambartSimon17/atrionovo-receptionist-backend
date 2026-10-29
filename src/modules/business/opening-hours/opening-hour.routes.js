import openingHourController from "./opening-hour.controller.js";
import { authenticate } from "../../../middleware/auth.middleware.js";
import {
  requireBusinessOwnership,
} from "../../../middleware/business-ownership.middleware.js";

// ======================================================
// Opening Hour Routes
// ======================================================
//
// Dashboard routes are protected by:
//
// 1. JWT authentication
// 2. Business ownership
//
// These routes are NOT VAPI routes.
// ======================================================

export default async function openingHourRoutes(
  fastify
) {
  fastify.get(
    "/:businessId/opening-hours",
    {
      preHandler: [
        authenticate,
        requireBusinessOwnership,
      ],
    },
    openingHourController.findSchedule
  );

  fastify.put(
    "/:businessId/opening-hours",
    {
      preHandler: [
        authenticate,
        requireBusinessOwnership,
      ],
    },
    openingHourController.replaceSchedule
  );

  
}