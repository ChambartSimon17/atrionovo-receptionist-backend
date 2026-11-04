import prisma from "../../db/prisma.js";

import NotFoundError from "../../errors/NotFoundError.js";
import { ErrorCodes } from "../../errors/error-codes.js";

import pushService from "./push.service.js";

// ======================================================
// Insights
// ======================================================
//
// guest history   every guest with all their bookings,
//                 in one query, for Gasten and Analyse
// calls           the call log of the AI receptionist
// ai stats        what the AI handled in a period
// call events     the Vapi end-of-call report, stored
//                 as a CallLog
// ======================================================

const bookingSelect = {
  id: true,
  status: true,
  source: true,
  startTime: true,
  endTime: true,
};

function parseRange(from, to) {
  const start = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
  const end = to ? new Date(to) : new Date();

  return {
    start: Number.isNaN(start.getTime()) ? new Date(0) : start,
    end: Number.isNaN(end.getTime()) ? new Date() : end,
  };
}

function firstDefined(...values) {
  return values.find(
    (value) => value !== undefined && value !== null && value !== ""
  );
}

function isFailed(analysis) {
  const evaluation = analysis?.successEvaluation;

  return (
    evaluation === false ||
    evaluation === "false" ||
    evaluation === "fail" ||
    analysis?.structuredData?.needsCallback === true
  );
}

class InsightsService {
  async getGuestHistory(businessId) {
    const [customers, otherReservations] = await Promise.all([
      prisma.customer.findMany({
        where: { businessId },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        include: {
          reservations: {
            select: { ...bookingSelect, guestCount: true },
            orderBy: { startTime: "desc" },
          },
          appointments: {
            select: {
              ...bookingSelect,
              serviceName: true,
              priceCents: true,
              therapistId: true,
            },
            orderBy: { startTime: "desc" },
          },
        },
      }),
      // Walk-ins and other bookings without a guest.
      prisma.reservation.findMany({
        where: { businessId, customerId: null },
        select: { ...bookingSelect, guestCount: true },
        orderBy: { startTime: "desc" },
      }),
    ]);

    return { guests: customers, otherReservations };
  }

  async getCalls(businessId, { from, to, limit }) {
    const { start, end } = parseRange(from, to);

    return prisma.callLog.findMany({
      where: {
        businessId,
        startedAt: { gte: start, lt: end },
      },
      orderBy: { startedAt: "desc" },
      take: Math.min(Number(limit) || 100, 500),
    });
  }

  async getCall(businessId, callId) {
    const call = await prisma.callLog.findFirst({
      where: { id: callId, businessId },
    });

    if (!call) {
      throw new NotFoundError("Call not found.", ErrorCodes.CALL_NOT_FOUND);
    }

    return call;
  }

  async setCallHandled(businessId, callId, handled) {
    await this.getCall(businessId, callId);

    return prisma.callLog.update({
      where: { id: callId },
      data: { handledAt: handled ? new Date() : null },
    });
  }

  async getAiStats(businessId, { from, to }) {
    const { start, end } = parseRange(from, to);
    const period = { gte: start, lt: end };

    const [calls, reservations, appointments] = await Promise.all([
      prisma.callLog.findMany({
        where: { businessId, startedAt: period },
        select: { outcome: true, durationSeconds: true, handledAt: true },
      }),
      prisma.reservation.findMany({
        where: { businessId, source: "AI", createdAt: period },
        select: { guestCount: true, status: true },
      }),
      prisma.appointment.findMany({
        where: { businessId, source: "AI", createdAt: period },
        select: { priceCents: true, status: true },
      }),
    ]);

    const outcomes = {
      BOOKED: 0,
      CHANGED: 0,
      INFORMATION: 0,
      NEEDS_CALLBACK: 0,
    };

    calls.forEach((call) => {
      outcomes[call.outcome] += 1;
    });

    const kept = (booking) => booking.status !== "CANCELLED";

    return {
      callCount: calls.length,
      outcomes,
      openCallbacks: calls.filter(
        (call) => call.outcome === "NEEDS_CALLBACK" && !call.handledAt
      ).length,
      minutes: Math.round(
        calls.reduce((sum, call) => sum + call.durationSeconds, 0) / 60
      ),
      reservationCount: reservations.filter(kept).length,
      covers: reservations
        .filter(kept)
        .reduce((sum, reservation) => sum + reservation.guestCount, 0),
      appointmentCount: appointments.filter(kept).length,
      revenueCents: appointments
        .filter(kept)
        .reduce((sum, appointment) => sum + appointment.priceCents, 0),
    };
  }

  /**
   * Stores a Vapi server message. Only the end-of-call
   * report is kept; other message types are ignored.
   */
  async handleCallEvent(body, { businessIdFromQuery, log }) {
    const message = body?.message ?? body;

    if (message?.type !== "end-of-call-report") {
      return { stored: false };
    }

    const call = message.call ?? {};

    const businessId = firstDefined(
      call.metadata?.businessId,
      call.assistantOverrides?.metadata?.businessId,
      call.assistantOverrides?.variableValues?.businessId,
      message.assistant?.metadata?.businessId,
      businessIdFromQuery
    );

    const business = businessId
      ? await prisma.business.findUnique({ where: { id: businessId } })
      : null;

    if (!business || !call.id) {
      log?.warn?.({ callId: call.id }, "Call report without a known business");
      return { stored: false };
    }

    const startedAt = new Date(
      firstDefined(message.startedAt, call.startedAt, call.createdAt, Date.now())
    );
    const endedAt = new Date(
      firstDefined(message.endedAt, call.endedAt, Date.now())
    );
    const callerNumber = firstDefined(call.customer?.number) ?? null;

    // What happened during the call: a booking made or
    // changed by the AI in the call window.
    const window = {
      gte: new Date(startedAt.getTime() - 60_000),
      lte: new Date(endedAt.getTime() + 60_000),
    };

    const [created, changed] = await Promise.all([
      Promise.all([
        prisma.reservation.count({
          where: { businessId, source: "AI", createdAt: window },
        }),
        prisma.appointment.count({
          where: { businessId, source: "AI", createdAt: window },
        }),
      ]),
      callerNumber
        ? Promise.all([
            prisma.reservation.count({
              where: {
                businessId,
                phoneNumber: callerNumber,
                updatedAt: window,
                createdAt: { lt: window.gte },
              },
            }),
            prisma.appointment.count({
              where: {
                businessId,
                phoneNumber: callerNumber,
                updatedAt: window,
                createdAt: { lt: window.gte },
              },
            }),
          ])
        : [0, 0],
    ]);

    const outcome =
      created[0] + created[1] > 0
        ? "BOOKED"
        : changed[0] + changed[1] > 0
          ? "CHANGED"
          : isFailed(message.analysis)
            ? "NEEDS_CALLBACK"
            : "INFORMATION";

    const customer = callerNumber
      ? await prisma.customer.findFirst({
          where: { businessId, phoneNumber: callerNumber },
        })
      : null;

    const data = {
      businessId,
      callerNumber,
      callerName: customer
        ? `${customer.firstName} ${customer.lastName}`.trim()
        : firstDefined(call.customer?.name) ?? null,
      startedAt,
      endedAt,
      durationSeconds: Math.max(
        0,
        Math.round(
          firstDefined(
            message.durationSeconds,
            (endedAt.getTime() - startedAt.getTime()) / 1000
          )
        )
      ),
      outcome,
      summary: firstDefined(message.analysis?.summary, message.summary) ?? null,
      transcript:
        firstDefined(message.artifact?.transcript, message.transcript) ?? null,
      recordingUrl:
        firstDefined(
          message.artifact?.recordingUrl,
          message.recordingUrl,
          message.artifact?.recording?.mono?.combinedUrl
        ) ?? null,
      endedReason: message.endedReason ?? null,
    };

    const saved = await prisma.callLog.upsert({
      where: { externalId: call.id },
      create: { ...data, externalId: call.id },
      update: data,
    });

    if (outcome === "NEEDS_CALLBACK") {
      await pushService.notifyBusiness(
        businessId,
        {
          title: "Bel terug",
          body: `${data.callerName || callerNumber || "Een beller"}: de AI kon niet helpen.`,
          data: { type: "call", callId: saved.id },
        },
        log
      );
    }

    return { stored: true, id: saved.id, outcome };
  }
}

export default new InsightsService();
