import { z } from "zod";

import { authenticate } from "../../middleware/auth.middleware.js";
import { requireBusinessOwnership } from "../../middleware/business-ownership.middleware.js";

import paymentService, { pages } from "./payment.service.js";

// ======================================================
// Payment routes
// ======================================================
//
// prefix /businesses
//   GET  /:businessId/payments/stripe
//   POST /:businessId/payments/stripe/onboarding
//   POST /:businessId/payments
//   GET  /:businessId/payments/summary?date
//   GET  /:businessId/payments/:paymentId
//   POST /:businessId/payments/:paymentId/cancel
//
// prefix /payments (public pages Stripe returns to)
//   GET  /done
//   GET  /stripe-return
// ======================================================

const createSchema = z.object({
  appointmentId: z.string().min(1).nullable().optional(),
  method: z.enum(["CASH", "CARD_TERMINAL", "STRIPE_LINK"]),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        amountCents: z.number().int().min(0).max(1_000_000),
      })
    )
    .min(1)
    .max(20),
  tipCents: z.number().int().min(0).max(100_000).default(0),
});

const preHandler = [authenticate, requireBusinessOwnership];

const ok = (data) => ({ success: true, data });

export async function paymentBusinessRoutes(fastify) {
  fastify.get(
    "/:businessId/payments/stripe",
    { preHandler },
    async (request) =>
      ok(await paymentService.stripeStatus(request.params.businessId))
  );

  fastify.post(
    "/:businessId/payments/stripe/onboarding",
    { preHandler },
    async (request) =>
      ok(
        await paymentService.onboardingLink(
          request.params.businessId,
          request.user?.userId
        )
      )
  );

  fastify.post(
    "/:businessId/payments",
    { preHandler },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          ok(
            await paymentService.create(
              request.params.businessId,
              createSchema.parse(request.body)
            )
          )
        )
  );

  fastify.get(
    "/:businessId/payments/summary",
    { preHandler },
    async (request) => {
      const { date } = z
        .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
        .parse(request.query ?? {});

      return ok(
        await paymentService.summary(request.params.businessId, date)
      );
    }
  );

  fastify.get(
    "/:businessId/payments/:paymentId",
    { preHandler },
    async (request) =>
      ok(
        await paymentService.get(
          request.params.businessId,
          request.params.paymentId
        )
      )
  );

  fastify.post(
    "/:businessId/payments/:paymentId/cancel",
    { preHandler },
    async (request) =>
      ok(
        await paymentService.cancel(
          request.params.businessId,
          request.params.paymentId
        )
      )
  );
}

export async function paymentPageRoutes(fastify) {
  fastify.get("/done", async (request, reply) =>
    reply.type("text/html; charset=utf-8").send(pages.paid)
  );

  fastify.get("/stripe-return", async (request, reply) =>
    reply.type("text/html; charset=utf-8").send(pages.connected)
  );
}
