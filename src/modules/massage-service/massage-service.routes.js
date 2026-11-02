import massageServiceController from "./massage-service.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import {
  requireBusinessOwnership,
} from "../../middleware/business-ownership.middleware.js";
import {
  requireBusinessType,
} from "../../middleware/business-type.middleware.js";

// ======================================================
// Massage Service Routes
// ======================================================
//
// Only available to MASSAGE businesses, and only for
// their own business:
//
// 1. JWT authentication
// 2. Business ownership
// 3. Business type
// ======================================================

const preHandler = [
  authenticate,
  requireBusinessOwnership,
  requireBusinessType("MASSAGE"),
];

export default async function massageServiceRoutes(
  fastify
) {
  fastify.get(
    "/:businessId/massage-services",
    { preHandler },
    massageServiceController.list.bind(
      massageServiceController
    )
  );

  fastify.post(
    "/:businessId/massage-services",
    { preHandler },
    massageServiceController.create.bind(
      massageServiceController
    )
  );

  fastify.patch(
    "/:businessId/massage-services/:serviceId",
    { preHandler },
    massageServiceController.update.bind(
      massageServiceController
    )
  );

  fastify.delete(
    "/:businessId/massage-services/:serviceId",
    { preHandler },
    massageServiceController.deactivate.bind(
      massageServiceController
    )
  );
}
