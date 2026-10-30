import therapistController from "./therapist.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import {
  requireBusinessOwnership,
} from "../../middleware/business-ownership.middleware.js";
import {
  requireBusinessType,
} from "../../middleware/business-type.middleware.js";

// ======================================================
// Therapist Routes
// ======================================================
//
// Only available to MASSAGE businesses, and only for
// their own business: authentication, ownership, type.
// ======================================================

const preHandler = [
  authenticate,
  requireBusinessOwnership,
  requireBusinessType("MASSAGE"),
];

export default async function therapistRoutes(
  fastify
) {
  fastify.get(
    "/:businessId/therapists",
    { preHandler },
    therapistController.list.bind(therapistController)
  );

  fastify.post(
    "/:businessId/therapists",
    { preHandler },
    therapistController.create.bind(therapistController)
  );

  fastify.patch(
    "/:businessId/therapists/:therapistId",
    { preHandler },
    therapistController.update.bind(therapistController)
  );

  fastify.delete(
    "/:businessId/therapists/:therapistId",
    { preHandler },
    therapistController.deactivate.bind(
      therapistController
    )
  );
}
