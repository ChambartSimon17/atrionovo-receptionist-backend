import treatmentRoomController from "./treatment-room.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import {
  requireBusinessOwnership,
} from "../../middleware/business-ownership.middleware.js";
import {
  requireBusinessType,
} from "../../middleware/business-type.middleware.js";

// ======================================================
// Treatment Room Routes
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

export default async function treatmentRoomRoutes(
  fastify
) {
  fastify.get(
    "/:businessId/treatment-rooms",
    { preHandler },
    treatmentRoomController.list.bind(
      treatmentRoomController
    )
  );

  fastify.post(
    "/:businessId/treatment-rooms",
    { preHandler },
    treatmentRoomController.create.bind(
      treatmentRoomController
    )
  );

  fastify.patch(
    "/:businessId/treatment-rooms/:roomId",
    { preHandler },
    treatmentRoomController.update.bind(
      treatmentRoomController
    )
  );

  fastify.delete(
    "/:businessId/treatment-rooms/:roomId",
    { preHandler },
    treatmentRoomController.deactivate.bind(
      treatmentRoomController
    )
  );
}
