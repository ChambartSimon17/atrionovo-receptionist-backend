import Stripe from "stripe";

import prisma from "../../db/prisma.js";
import env from "../../config/env.js";
import businessRepository from "../business/business.repository.js";
import AppError from "../../errors/AppError.js";
import NotFoundError from "../../errors/NotFoundError.js";
import ValidationError from "../../errors/ValidationError.js";
import { ErrorCodes } from "../../errors/error-codes.js";
import { getUtcRangeForLocalDay } from "../../utils/time.utils.js";

// ======================================================
// Payments
// ======================================================
//
// Settling an appointment at the counter.
//
// Cash and the business's own card terminal are only
// registered: they are PAID at once.
//
// Stripe (STRIPE_LINK): every business connects its own
// Stripe account (Stripe Connect, Express). The app shows
// a QR code of a Stripe Checkout page; the customer pays
// with Bancontact, Apple Pay or a card, and the money goes
// to the business's account (a destination charge). The
// app asks for the status until Stripe reports it paid,
// so no webhook is needed.
//
// Without STRIPE_SECRET_KEY the Stripe part is switched
// off and only cash and terminal payments work.
// ======================================================

const stripe = env.stripeSecretKey
  ? new Stripe(env.stripeSecretKey)
  : null;

function paymentError(message, code, statusCode = 400) {
  const error = new AppError(message, statusCode);

  error.code = code;

  return error;
}

export function paymentDto(payment) {
  return {
    id: payment.id,
    appointmentId: payment.appointmentId,
    method: payment.method,
    status: payment.status,
    items: payment.items,
    amountCents: payment.amountCents,
    tipCents: payment.tipCents,
    totalCents: payment.amountCents + payment.tipCents,
    currency: payment.currency,
    checkoutUrl: payment.status === "PENDING" ? payment.checkoutUrl : null,
    stripeMethod: payment.stripeMethod,
    paidAt: payment.paidAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
  };
}

function page(title, text) {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;font-family:-apple-system,system-ui,sans-serif;background:#F6F4EF;color:#1C2421;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px;box-sizing:border-box">
<div><div style="width:72px;height:72px;border-radius:50%;background:#1F5F55;color:#fff;font-size:36px;line-height:72px;margin:0 auto 16px">✓</div>
<h1 style="font-size:22px;margin:0 0 8px">${title}</h1>
<p style="color:#5B6661;margin:0">${text}</p></div></body></html>`;
}

export const pages = {
  paid: page("Betaling ontvangen", "Bedankt! Je kan dit venster sluiten."),
  connected: page(
    "Stripe gekoppeld",
    "Ga terug naar de AtrioNovo-app om verder te gaan."
  ),
};

class PaymentService {
  /**
   * GET /payments/stripe
   * Whether the business can take Stripe payments.
   */
  async stripeStatus(businessId) {
    const business = await this.#business(businessId);

    if (!stripe) {
      return { configured: false, connected: false, chargesEnabled: false };
    }

    if (business.stripeAccountId && !business.stripeChargesEnabled) {
      await this.#refreshAccount(business);
    }

    const fresh = await this.#business(businessId);

    return {
      configured: true,
      connected: Boolean(fresh.stripeAccountId),
      chargesEnabled: fresh.stripeChargesEnabled,
    };
  }

  /**
   * POST /payments/stripe/onboarding
   * A Stripe page where the owner fills in the business
   * and bank details. Creates the connected account the
   * first time.
   */
  async onboardingLink(businessId, userId) {
    const business = await this.#business(businessId);
    const client = this.#stripe();

    const user = userId
      ? await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true },
        })
      : null;

    const email = user?.email;

    let accountId = business.stripeAccountId;

    if (!accountId) {
      const account = await client.accounts.create({
        type: "express",
        country: "BE",
        email: email || undefined,
        business_profile: { name: business.name },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
          bancontact_payments: { requested: true },
        },
        metadata: { businessId },
      });

      accountId = account.id;

      await prisma.business.update({
        where: { id: businessId },
        data: { stripeAccountId: accountId },
      });
    }

    const link = await client.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${env.publicBaseUrl}/payments/stripe-return`,
      return_url: `${env.publicBaseUrl}/payments/stripe-return`,
    });

    return { url: link.url };
  }

  /**
   * POST /payments
   * { appointmentId?, items, tipCents, method }
   */
  async create(businessId, data) {
    const business = await this.#business(businessId);

    if (data.appointmentId) {
      const appointment = await prisma.appointment.findFirst({
        where: { id: data.appointmentId, businessId },
      });

      if (!appointment) {
        throw new NotFoundError(
          "Appointment not found.",
          ErrorCodes.APPOINTMENT_NOT_FOUND
        );
      }
    }

    const amountCents = data.items.reduce(
      (total, item) => total + item.amountCents,
      0
    );

    if (amountCents + data.tipCents <= 0) {
      throw new ValidationError(
        "There is nothing to pay.",
        ErrorCodes.VALIDATION_ERROR
      );
    }

    // An earlier unfinished Stripe payment of the same
    // appointment is replaced by this one.
    if (data.appointmentId) {
      await prisma.payment.updateMany({
        where: {
          businessId,
          appointmentId: data.appointmentId,
          status: "PENDING",
        },
        data: { status: "CANCELLED" },
      });
    }

    const base = {
      businessId,
      appointmentId: data.appointmentId ?? null,
      method: data.method,
      items: data.items,
      amountCents,
      tipCents: data.tipCents,
    };

    if (data.method !== "STRIPE_LINK") {
      const payment = await prisma.payment.create({
        data: { ...base, status: "PAID", paidAt: new Date() },
      });

      await this.#completeAppointment(payment);

      return paymentDto(payment);
    }

    const client = this.#stripe();

    if (!business.stripeAccountId || !business.stripeChargesEnabled) {
      await this.#refreshAccount(business);

      const fresh = await this.#business(businessId);

      if (!fresh.stripeChargesEnabled) {
        throw paymentError(
          "Connect a Stripe account first.",
          ErrorCodes.STRIPE_NOT_CONNECTED
        );
      }
    }

    const payment = await prisma.payment.create({ data: base });

    const lineItems = [
      ...data.items,
      ...(data.tipCents > 0
        ? [{ name: "Fooi", amountCents: data.tipCents }]
        : []),
    ]
      .filter((item) => item.amountCents > 0)
      .map((item) => ({
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: item.amountCents,
          product_data: { name: item.name },
        },
      }));

    const session = await client.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: `${env.publicBaseUrl}/payments/done`,
      payment_intent_data: {
        on_behalf_of: business.stripeAccountId,
        transfer_data: { destination: business.stripeAccountId },
        metadata: { paymentId: payment.id, businessId },
      },
      metadata: { paymentId: payment.id, businessId },
    });

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: { stripeSessionId: session.id, checkoutUrl: session.url },
    });

    return paymentDto(updated);
  }

  /**
   * GET /payments/:id
   * A pending Stripe payment is checked with Stripe first.
   */
  async get(businessId, paymentId) {
    const payment = await this.#payment(businessId, paymentId);

    if (
      payment.status !== "PENDING" ||
      !payment.stripeSessionId ||
      !stripe
    ) {
      return paymentDto(payment);
    }

    const session = await stripe.checkout.sessions.retrieve(
      payment.stripeSessionId,
      { expand: ["payment_intent.payment_method"] }
    );

    if (session.payment_status === "paid") {
      const paid = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          stripeMethod:
            session.payment_intent?.payment_method?.type ?? null,
        },
      });

      await this.#completeAppointment(paid);

      return paymentDto(paid);
    }

    if (session.status === "expired") {
      const cancelled = await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "CANCELLED" },
      });

      return paymentDto(cancelled);
    }

    return paymentDto(payment);
  }

  /**
   * POST /payments/:id/cancel
   */
  async cancel(businessId, paymentId) {
    const payment = await this.#payment(businessId, paymentId);

    if (payment.status !== "PENDING") {
      return paymentDto(payment);
    }

    if (payment.stripeSessionId && stripe) {
      await stripe.checkout.sessions
        .expire(payment.stripeSessionId)
        .catch(() => {});
    }

    const cancelled = await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "CANCELLED" },
    });

    return paymentDto(cancelled);
  }

  /**
   * GET /payments/summary?date=YYYY-MM-DD
   * What came in on one day.
   */
  async summary(businessId, date) {
    const business = await this.#business(businessId);
    const range = getUtcRangeForLocalDay(date, business.timezone);

    const payments = await prisma.payment.findMany({
      where: {
        businessId,
        status: "PAID",
        paidAt: { gte: range.start, lt: range.end },
      },
    });

    const total = (method) =>
      payments
        .filter((payment) => !method || payment.method === method)
        .reduce(
          (sum, payment) => sum + payment.amountCents + payment.tipCents,
          0
        );

    return {
      date,
      count: payments.length,
      totalCents: total(),
      stripeCents: total("STRIPE_LINK"),
      terminalCents: total("CARD_TERMINAL"),
      cashCents: total("CASH"),
      tipCents: payments.reduce((sum, payment) => sum + payment.tipCents, 0),
    };
  }

  async #completeAppointment(payment) {
    if (!payment.appointmentId) {
      return;
    }

    // A paid appointment that was still confirmed is done.
    await prisma.appointment.updateMany({
      where: { id: payment.appointmentId, status: "CONFIRMED" },
      data: { status: "COMPLETED" },
    });
  }

  async #refreshAccount(business) {
    if (!stripe || !business.stripeAccountId) {
      return;
    }

    const account = await stripe.accounts.retrieve(business.stripeAccountId);

    await prisma.business.update({
      where: { id: business.id },
      data: { stripeChargesEnabled: Boolean(account.charges_enabled) },
    });
  }

  #stripe() {
    if (!stripe) {
      throw paymentError(
        "Stripe is not set up on the server.",
        ErrorCodes.STRIPE_NOT_CONFIGURED,
        503
      );
    }

    return stripe;
  }

  async #payment(businessId, paymentId) {
    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, businessId },
    });

    if (!payment) {
      throw new NotFoundError(
        "Payment not found.",
        ErrorCodes.PAYMENT_NOT_FOUND
      );
    }

    return payment;
  }

  async #business(businessId) {
    const business = await businessRepository.findById(businessId);

    if (!business) {
      throw new NotFoundError(
        "Business not found.",
        ErrorCodes.BUSINESS_NOT_FOUND
      );
    }

    return business;
  }
}

export default new PaymentService();
