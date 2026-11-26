import prisma from "../../db/prisma.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requireBusinessOwnership } from "../../middleware/business-ownership.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import NotFoundError from "../../errors/NotFoundError.js";

import { planById, priceCents } from "./plans.js";
import { monthOf, monthRange } from "./usage-math.js";
import usageService from "./usage.service.js";
import {
  billingEnabled,
  handleWebhookEvent,
  portalUrl,
  verifyWebhook,
} from "./stripe-billing.service.js";

// ======================================================
// Billing routes
// ======================================================
//
// prefix /businesses
//   GET  /:businessId/billing          plan, this month's
//                                      usage, invoices
//                                      (owner, manager)
//   POST /:businessId/billing/portal   { url } of Stripe's
//                                      customer portal (owner)
//
// prefix /billing
//   POST /webhook                      Stripe events
//                                      (signed, raw body)
// ======================================================

const readers = {
  preHandler: [authenticate, requireBusinessOwnership, requireRole("OWNER", "MANAGER")],
};

const owners = {
  preHandler: [authenticate, requireBusinessOwnership, requireRole("OWNER")],
};

async function billingView(businessId) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });

  if (!business) {
    throw new NotFoundError("Business not found.");
  }

  const month = monthOf(new Date());
  const usage = await usageService.businessMonth(business, month);
  const plan = planById(business.billingPlan);

  const invoices = await prisma.billingInvoice.findMany({
    where: { businessId, stripeInvoiceId: { not: null }, status: { not: "draft" } },
    orderBy: { issuedAt: "desc" },
    take: 12,
  });

  return {
    plan: plan && {
      id: plan.id,
      name: plan.name,
      interval: business.billingInterval,
      priceCents: priceCents(plan, business.billingInterval),
      includedMinutes: plan.includedMinutes,
      includedSms: plan.includedSms,
    },
    status: business.subscriptionStatus,
    trialEndsAt: business.trialEndsAt,
    cancelAtPeriodEnd: business.cancelAtPeriodEnd,
    month,
    resetsAt: monthRange(month).end,
    usage: {
      calls: usage.calls,
      minutes: usage.minutes,
      sms: usage.sms,
      extraMinutes: usage.extraMinutes,
      extraSms: usage.extraSms,
      extraCents: usage.extraCents,
    },
    canManage: billingEnabled() && Boolean(business.stripeCustomerId),
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      kind: invoice.kind,
      number: invoice.number,
      status: invoice.status,
      totalCents: invoice.totalCents,
      issuedAt: invoice.issuedAt,
      url: invoice.hostedInvoiceUrl,
    })),
  };
}

export async function billingBusinessRoutes(fastify) {
  fastify.get("/:businessId/billing", readers, async (request) =>
    billingView(request.params.businessId)
  );

  fastify.post("/:businessId/billing/portal", owners, async (request) => ({
    url: await portalUrl(request.params.businessId),
  }));
}

export async function billingWebhookRoutes(fastify) {
  // Stripe signs the exact bytes: keep the body raw in
  // this plugin only.
  fastify.removeAllContentTypeParsers();
  fastify.addContentTypeParser("*", { parseAs: "buffer" }, (request, body, done) =>
    done(null, body)
  );

  fastify.post("/webhook", async (request, reply) => {
    const event = verifyWebhook(request.body, request.headers["stripe-signature"]);
    const result = await handleWebhookEvent(event, request.log);

    return reply.send({ received: true, ...result });
  });
}
