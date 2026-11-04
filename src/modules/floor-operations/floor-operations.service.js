import prisma from "../../db/prisma.js";

import NotFoundError from "../../errors/NotFoundError.js";
import ValidationError from "../../errors/ValidationError.js";
import ConflictError from "../../errors/ConflictError.js";
import { ErrorCodes } from "../../errors/error-codes.js";

import { addMinutes } from "../../utils/time.utils.js";

// ======================================================
// Floor operations
// ======================================================
//
// What a host does on the floor during a service, on top
// of seating and completing a reservation:
//
//   no-show   CONFIRMED -> NO_SHOW   (guests never came)
//   undo      one step back, for a tap by mistake:
//               SEATED    -> CONFIRMED
//               COMPLETED -> SEATED
//               NO_SHOW   -> CONFIRMED
//   tables    move a reservation to other tables
//   walk-in   seat guests without a booking right away
// ======================================================

const UNDO_STATUS = {
  SEATED: "CONFIRMED",
  COMPLETED: "SEATED",
  NO_SHOW: "CONFIRMED",
};

const WALK_IN_DEFAULT_MINUTES = 90;

const reservationInclude = {
  tables: {
    include: {
      table: true,
    },
  },
};

async function findReservation(reservationId, businessId, db = prisma) {
  const reservation = await db.reservation.findFirst({
    where: {
      id: reservationId,
      businessId,
    },
  });

  if (!reservation) {
    throw new NotFoundError(
      "Reservation not found.",
      ErrorCodes.RESERVATION_NOT_FOUND
    );
  }

  return reservation;
}

/**
 * Throws when one of the tables is taken by another open
 * reservation in the period.
 */
async function ensureTablesFree(
  { businessId, tableIds, startTime, endTime, ignoreReservationId },
  db
) {
  const tables = await db.table.findMany({
    where: {
      id: { in: tableIds },
      businessId,
      isActive: true,
    },
  });

  if (tables.length !== tableIds.length) {
    throw new ValidationError(
      "One of the tables does not exist.",
      ErrorCodes.RESERVATION_NOT_AVAILABLE
    );
  }

  const clash = await db.reservationTable.findFirst({
    where: {
      tableId: { in: tableIds },
      reservation: {
        businessId,
        id: ignoreReservationId
          ? { not: ignoreReservationId }
          : undefined,
        status: { in: ["CONFIRMED", "SEATED"] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    },
    include: {
      table: true,
      reservation: true,
    },
  });

  if (clash) {
    throw new ConflictError(
      `Table ${clash.table.name} is taken by ${`${clash.reservation.firstName} ${clash.reservation.lastName}`.trim()}.`,
      ErrorCodes.RESERVATION_NOT_AVAILABLE
    );
  }

  return tables;
}

class FloorOperationsService {
  async markNoShow(reservationId, businessId) {
    const reservation = await findReservation(
      reservationId,
      businessId
    );

    if (reservation.status !== "CONFIRMED") {
      throw new ValidationError(
        "Only confirmed reservations can be marked as no-show.",
        ErrorCodes.RESERVATION_NOT_CONFIRMED
      );
    }

    return prisma.reservation.update({
      where: { id: reservationId },
      data: { status: "NO_SHOW" },
      include: reservationInclude,
    });
  }

  async undoStatus(reservationId, businessId) {
    const reservation = await findReservation(
      reservationId,
      businessId
    );

    const status = UNDO_STATUS[reservation.status];

    if (!status) {
      throw new ValidationError(
        "This reservation cannot be undone.",
        ErrorCodes.RESERVATION_NOT_CONFIRMED
      );
    }

    return prisma.reservation.update({
      where: { id: reservationId },
      data: { status },
      include: reservationInclude,
    });
  }

  async moveToTables(reservationId, businessId, tableIds) {
    if (!Array.isArray(tableIds) || tableIds.length === 0) {
      throw new ValidationError(
        "Choose at least one table.",
        ErrorCodes.RESERVATION_NOT_AVAILABLE
      );
    }

    return prisma.$transaction(async (tx) => {
      const reservation = await findReservation(
        reservationId,
        businessId,
        tx
      );

      await ensureTablesFree(
        {
          businessId,
          tableIds,
          startTime: reservation.startTime,
          endTime: reservation.endTime,
          ignoreReservationId: reservationId,
        },
        tx
      );

      await tx.reservationTable.deleteMany({
        where: { reservationId },
      });

      await tx.reservationTable.createMany({
        data: tableIds.map((tableId) => ({
          reservationId,
          tableId,
        })),
      });

      return tx.reservation.findUnique({
        where: { id: reservationId },
        include: reservationInclude,
      });
    });
  }

  /**
   * Seats guests without a booking. The reservation starts
   * now and is SEATED straight away, so it shows on the
   * floor and counts in the analytics as a walk-in.
   */
  async createWalkIn(
    businessId,
    { guestCount, tableIds, durationMinutes, name, notes }
  ) {
    const count = Number(guestCount);

    if (!Number.isInteger(count) || count < 1 || count > 50) {
      throw new ValidationError(
        "Enter a number of guests between 1 and 50.",
        ErrorCodes.MAX_RESERVATION_SIZE_EXCEEDED
      );
    }

    if (!Array.isArray(tableIds) || tableIds.length === 0) {
      throw new ValidationError(
        "Choose at least one table.",
        ErrorCodes.RESERVATION_NOT_AVAILABLE
      );
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new NotFoundError(
        "Business not found.",
        ErrorCodes.BUSINESS_NOT_FOUND
      );
    }

    const startTime = new Date();
    const endTime = addMinutes(
      startTime,
      Number(durationMinutes) || WALK_IN_DEFAULT_MINUTES
    );

    return prisma.$transaction(async (tx) => {
      await ensureTablesFree(
        { businessId, tableIds, startTime, endTime },
        tx
      );

      return tx.reservation.create({
        data: {
          businessId,
          firstName: name?.trim() || "Walk-in",
          lastName: "",
          phoneNumber: "",
          guestCount: count,
          startTime,
          endTime,
          status: "SEATED",
          source: "WALK_IN",
          notes: notes?.trim() || null,
          tables: {
            create: tableIds.map((tableId) => ({
              table: { connect: { id: tableId } },
            })),
          },
        },
        include: reservationInclude,
      });
    });
  }
}

export default new FloorOperationsService();
