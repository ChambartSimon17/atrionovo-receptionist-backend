import prisma from "../../db/prisma.js";
import { Prisma } from "@prisma/client";

// ======================================================
// Calendar Sync Repository
// ======================================================
//
// Database access for calendar connections, external
// calendars, mirrored busy blocks and the calendar copy
// of appointments.
// ======================================================

const calendarWithConnection = {
  connection: true,
  business: { select: { timezone: true } },
};

class CalendarSyncRepository {
  findActiveCalendars(businessId) {
    return prisma.externalCalendar.findMany({
      where: {
        isActive: true,
        connection: { isActive: true },
        ...(businessId ? { businessId } : {}),
      },
      include: calendarWithConnection,
      orderBy: { createdAt: "asc" },
    });
  }

  findCalendarsForBusiness(businessId) {
    return prisma.externalCalendar.findMany({
      where: { businessId },
      include: {
        connection: {
          select: {
            id: true,
            provider: true,
            username: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  findWriteTarget(businessId) {
    return prisma.externalCalendar.findFirst({
      where: {
        businessId,
        isWriteTarget: true,
        isActive: true,
        connection: {
          isActive: true,
          provider: "ICLOUD_CALDAV",
        },
      },
      include: calendarWithConnection,
    });
  }

  createConnection(data) {
    return prisma.calendarConnection.create({ data });
  }

  upsertCalendar(data) {
    return prisma.externalCalendar.upsert({
      where: {
        connectionId_remoteUrl: {
          connectionId: data.connectionId,
          remoteUrl: data.remoteUrl,
        },
      },
      create: data,
      update: data,
    });
  }

  clearWriteTargets(businessId) {
    return prisma.externalCalendar.updateMany({
      where: { businessId },
      data: { isWriteTarget: false },
    });
  }

  updateCalendar(id, data) {
    return prisma.externalCalendar.update({
      where: { id },
      data,
    });
  }

  /**
   * Replaces the blocks of one calendar that overlap the
   * window by the given ones, in one transaction.
   *
   * SERIALIZABLE: when two server instances sync the same
   * calendar at once, one fails (and retries next round)
   * instead of both inserting, which would duplicate rows.
   */
  replaceBlocks(calendar, from, to, blocks) {
    return prisma.$transaction(
      [
        prisma.externalBusyBlock.deleteMany({
          where: {
            calendarId: calendar.id,
            startTime: { lt: to },
            endTime: { gt: from },
          },
        }),
        prisma.externalBusyBlock.createMany({
          data: blocks.map((block) => ({
            businessId: calendar.businessId,
            calendarId: calendar.id,
            uid: block.uid,
            startTime: new Date(block.startMs),
            endTime: new Date(block.endMs),
            allDay: block.allDay,
          })),
        }),
      ],
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  /**
   * Blocks of active calendars overlapping [from, to).
   */
  findBlocksOverlapping(businessId, from, to, db = prisma) {
    return db.externalBusyBlock.findMany({
      where: {
        businessId,
        startTime: { lt: to },
        endTime: { gt: from },
        calendar: {
          isActive: true,
          connection: { isActive: true },
        },
      },
      include: {
        calendar: {
          select: {
            id: true,
            displayName: true,
            therapistId: true,
            travelMinutes: true,
          },
        },
      },
      orderBy: { startTime: "asc" },
    });
  }

  /**
   * Removes blocks that ended long ago.
   */
  deleteBlocksEndedBefore(date) {
    return prisma.externalBusyBlock.deleteMany({
      where: { endTime: { lt: date } },
    });
  }

  findAppointment(id) {
    return prisma.appointment.findUnique({
      where: { id },
    });
  }

  updateAppointmentCopy(id, data) {
    return prisma.appointment.update({
      where: { id },
      data,
    });
  }

  /**
   * Appointments whose calendar copy still has to be
   * written (or removed), oldest first.
   */
  findAppointmentsToPush(limit = 20) {
    return prisma.appointment.findMany({
      where: {
        externalSyncStatus: { in: ["PENDING", "FAILED"] },
        updatedAt: {
          gt: new Date(Date.now() - 7 * 24 * 60 * 60_000),
        },
      },
      select: { id: true },
      orderBy: { updatedAt: "asc" },
      take: limit,
    });
  }
}

export default new CalendarSyncRepository();
