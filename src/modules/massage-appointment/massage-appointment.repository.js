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
   * their working hours of the given weekday.
   */
  async findTherapistsForService(
    businessId,
    massageServiceId,
    dayOfWeek
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

  async findById(id, businessId) {
    return prisma.appointment.findFirst({
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

  async update(id, data) {
    return prisma.appointment.update({
      where: { id },
      data,
      include: LIST_INCLUDE,
    });
  }
}

export default new MassageAppointmentRepository();
