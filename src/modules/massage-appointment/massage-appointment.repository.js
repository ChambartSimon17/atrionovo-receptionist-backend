import prisma from "../../db/prisma.js";

// ======================================================
// Massage Appointment Repository
// ======================================================
//
// Responsibility
// Persist and retrieve appointments, and load the
// therapists and rooms that availability depends on.
//
// Every query includes businessId. Methods that take a
// Prisma client can run inside a transaction.
// ======================================================

// Appointments that occupy their therapist and room.
const OCCUPYING_STATUSES = ["CONFIRMED", "COMPLETED"];

const LIST_INCLUDE = {
  therapist: {
    select: { name: true },
  },
  room: {
    select: { name: true },
  },
  payments: {
    where: { status: "PAID" },
    select: {
      id: true,
      method: true,
      amountCents: true,
      tipCents: true,
      paidAt: true,
    },
    orderBy: { paidAt: "desc" },
    take: 1,
  },
};

class MassageAppointmentRepository {
  /**
   * Appointments of the business that occupy a therapist
   * and room at some moment in [rangeStart, rangeEnd).
   */
  async findOccupying(
    businessId,
    rangeStart,
    rangeEnd,
    db = prisma
  ) {
    return db.appointment.findMany({
      where: {
        businessId,
        status: { in: OCCUPYING_STATUSES },
        startTime: { lt: rangeEnd },
        endTime: { gt: rangeStart },
      },
    });
  }

  /**
   * Active therapists who can perform the massage, with
   * their working hours of the given weekday, and the
   * schedule day and absences of the date (a Date at UTC
   * midnight, see therapist/schedule.js).
   */
  async findTherapistsForService(
    businessId,
    massageServiceId,
    dayOfWeek,
    date
  ) {
    return prisma.therapist.findMany({
      where: {
        businessId,
        isActive: true,
        services: {
          some: { massageServiceId },
        },
      },
      include: {
        workingHours: {
          where: { dayOfWeek },
        },
        scheduleDays: {
          where: { date },
        },
        absences: {
          where: {
            startDate: { lte: date },
            endDate: { gte: date },
          },
        },
      },
    });
  }

  /**
   * Active rooms in which the massage can take place.
   */
  async findRoomsForService(
    businessId,
    massageServiceId
  ) {
    return prisma.treatmentRoom.findMany({
      where: {
        businessId,
        isActive: true,
        services: {
          some: { massageServiceId },
        },
      },
    });
  }

  /**
   * Number of future confirmed appointments of a phone
   * number (normalized) at the business. Used to limit
   * bookings made through the public widget.
   */
  async countUpcomingByPhone(
    businessId,
    phoneNumber,
    from
  ) {
    return prisma.appointment.count({
      where: {
        businessId,
        phoneNumber,
        status: "CONFIRMED",
        startTime: { gt: from },
      },
    });
  }

  /**
   * Future confirmed appointments of a phone number
   * (normalized), soonest first.
   */
  async findUpcomingByPhone(
    businessId,
    phoneNumber,
    from
  ) {
    return prisma.appointment.findMany({
      where: {
        businessId,
        phoneNumber,
        status: "CONFIRMED",
        startTime: { gt: from },
      },
      include: LIST_INCLUDE,
      orderBy: { startTime: "asc" },
    });
  }

  async findAllInRange(
    businessId,
    rangeStart,
    rangeEnd
  ) {
    return prisma.appointment.findMany({
      where: {
        businessId,
        startTime: {
          gte: rangeStart,
          lt: rangeEnd,
        },
      },
      include: LIST_INCLUDE,
      orderBy: { startTime: "asc" },
    });
  }

  /**
   * Start times of the appointments that count on the
   * calendar (confirmed and completed) in
   * [rangeStart, rangeEnd).
   */
  async findStartTimesInRange(
    businessId,
    rangeStart,
    rangeEnd
  ) {
    return prisma.appointment.findMany({
      where: {
        businessId,
        status: { in: OCCUPYING_STATUSES },
        startTime: {
          gte: rangeStart,
          lt: rangeEnd,
        },
      },
      select: { startTime: true },
    });
  }

  async findById(id, businessId, db = prisma) {
    return db.appointment.findFirst({
      where: { id, businessId },
      include: LIST_INCLUDE,
    });
  }

  async create(data, db = prisma) {
    return db.appointment.create({
      data,
      include: LIST_INCLUDE,
    });
  }

  async update(id, data, db = prisma) {
    return db.appointment.update({
      where: { id },
      data,
      include: LIST_INCLUDE,
    });
  }
}

export default new MassageAppointmentRepository();
