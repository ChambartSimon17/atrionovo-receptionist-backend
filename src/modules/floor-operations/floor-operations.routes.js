import { authenticate } from "../../middleware/auth.middleware.js";
import { requireBusinessOwnership } from "../../middleware/business-ownership.middleware.js";

import floorOperationsService from "./floor-operations.service.js";
import floorPlanService from "./floor-plan.service.js";

// ======================================================
// Floor routes (prefix /businesses)
// ======================================================
//
// GET    /:businessId/floor-plan
// PUT    /:businessId/floor-plan
// POST   /:businessId/walk-ins
// PATCH  /:businessId/reservations/:reservationId/no-show
// PATCH  /:businessId/reservations/:reservationId/undo
// PUT    /:businessId/reservations/:reservationId/tables
// ======================================================

const protectedRoute = {
  preHandler: [authenticate, requireBusinessOwnership],
};

export default async function floorOperationsRoutes(fastify) {
  fastify.get(
    "/:businessId/floor-plan",
    protectedRoute,
    async (request) =>
      floorPlanService.getPlan(request.params.businessId)
  );

  fastify.put(
    "/:businessId/floor-plan",
    protectedRoute,
    async (request) =>
      floorPlanService.savePlan(
        request.params.businessId,
        request.body
      )
  );

  fastify.post(
    "/:businessId/walk-ins",
    protectedRoute,
    async (request, reply) =>
      reply
        .code(201)
        .send(
          await floorOperationsService.createWalkIn(
            request.params.businessId,
            request.body ?? {}
          )
        )
  );

  fastify.patch(
    "/:businessId/reservations/:reservationId/no-show",
    protectedRoute,
    async (request) =>
      floorOperationsService.markNoShow(
        request.params.reservationId,
        request.params.businessId
      )
  );

  fastify.patch(
    "/:businessId/reservations/:reservationId/undo",
    protectedRoute,
    async (request) =>
      floorOperationsService.undoStatus(
        request.params.reservationId,
        request.params.businessId
      )
  );

  fastify.put(
    "/:businessId/reservations/:reservationId/tables",
    protectedRoute,
    async (request) =>
      floorOperationsService.moveToTables(
        request.params.reservationId,
        request.params.businessId,
        request.body?.tableIds
      )
  );
}
