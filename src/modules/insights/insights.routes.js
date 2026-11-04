import { authenticate } from "../../middleware/auth.middleware.js";
import { requireBusinessOwnership } from "../../middleware/business-ownership.middleware.js";

import insightsService from "./insights.service.js";
import pushService from "./push.service.js";

// ======================================================
// Insights routes
// ======================================================
//
// prefix /businesses
//   GET    /:businessId/guest-history
//   GET    /:businessId/calls?from&to&limit
//   GET    /:businessId/calls/:callId
//   PATCH  /:businessId/calls/:callId      { handled }
//   GET    /:businessId/ai-stats?from&to
//
// prefix /auth
//   POST   /push-tokens     { token }
//   DELETE /push-tokens     { token }
//
// prefix /assistant
//   POST   /call-events     Vapi server messages
// ======================================================

const protectedRoute = {
  preHandler: [authenticate, requireBusinessOwnership],
};

export async function insightsBusinessRoutes(fastify) {
  fastify.get(
    "/:businessId/guest-history",
    protectedRoute,
    async (request) =>
      insightsService.getGuestHistory(request.params.businessId)
  );

  fastify.get(
    "/:businessId/calls",
    protectedRoute,
    async (request) =>
      insightsService.getCalls(
        request.params.businessId,
        request.query ?? {}
      )
  );

  fastify.get(
    "/:businessId/calls/:callId",
    protectedRoute,
    async (request) =>
      insightsService.getCall(
        request.params.businessId,
        request.params.callId
      )
  );

  fastify.patch(
    "/:businessId/calls/:callId",
    protectedRoute,
    async (request) =>
      insightsService.setCallHandled(
        request.params.businessId,
        request.params.callId,
        request.body?.handled !== false
      )
  );

  fastify.get(
    "/:businessId/ai-stats",
    protectedRoute,
    async (request) =>
      insightsService.getAiStats(
        request.params.businessId,
        request.query ?? {}
      )
  );
}

export async function pushTokenRoutes(fastify) {
  fastify.post(
    "/push-tokens",
    { preHandler: authenticate },
    async (request, reply) => {
      await pushService.registerToken(
        request.user.userId,
        request.body?.token
      );

      return reply.code(204).send();
    }
  );

  fastify.delete(
    "/push-tokens",
    { preHandler: authenticate },
    async (request, reply) => {
      await pushService.removeToken(
        request.user.userId,
        request.body?.token
      );

      return reply.code(204).send();
    }
  );
}

export async function callEventRoutes(fastify) {
  // Vapi sends the secret configured on the assistant's
  // server URL in this header. Without VAPI_WEBHOOK_SECRET
  // set, the endpoint is open (local development).
  fastify.post("/call-events", async (request, reply) => {
    const secret = process.env.VAPI_WEBHOOK_SECRET;

    if (secret && request.headers["x-vapi-secret"] !== secret) {
      return reply.code(401).send({ success: false });
    }

    const result = await insightsService.handleCallEvent(request.body, {
      businessIdFromQuery: request.query?.businessId,
      log: request.log,
    });

    return reply.send(result);
  });
}
