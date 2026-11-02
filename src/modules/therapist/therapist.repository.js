import prisma from "../../db/prisma.js";

// ======================================================
// Therapist Repository
// ======================================================
//
// Responsibility
// Persist and retrieve therapists together with the
// massages they can perform and their weekly hours.
//
// Every query includes businessId, so a therapist of
// another business can never be reached through here.
// ======================================================

const INCLUDE = {
  services: {
    select: {
      massageServiceId: true,
    },
  },
  workingHours: {
    orderBy: [
      { dayOfWeek: "asc" },
      { startMinutes: "asc" },
    ],
  },
};

function toWorkingHourRows(therapistId, workingHours) {
  return workingHours.map((period) => ({
    therapistId,
    dayOfWeek: period.dayOfWeek,
    startMinutes: period.startMinutes,
    endMinutes: period.endMinutes,
  }));
}

class TherapistRepository {
  async findAllForBusiness(
    businessId,
    { includeInactive = false } = {}
  ) {
    return prisma.therapist.findMany({
      where: {
        businessId,
        ...(includeInactive
          ? {}
          : { isActive: true }),
      },
      include: INCLUDE,
      orderBy: [
        { isActive: "desc" },
        { name: "asc" },
      ],
    });
  }

  async findById(id, businessId) {
    return prisma.therapist.findFirst({
      where: {
        id,
        businessId,
      },
      include: INCLUDE,
    });
  }

  async findByName(businessId, name) {
    return prisma.therapist.findUnique({
      where: {
        businessId_name: {
          businessId,
          name,
        },
      },
    });
  }

  async create(
    businessId,
    { name, serviceIds, workingHours }
  ) {
    return prisma.therapist.create({
      data: {
        businessId,
        name,
        services: {
          create: serviceIds.map(
            (massageServiceId) => ({
              massageServiceId,
            })
          ),
        },
        workingHours: {
          create: workingHours.map((period) => ({
            dayOfWeek: period.dayOfWeek,
            startMinutes: period.startMinutes,
            endMinutes: period.endMinutes,
          })),
        },
      },
      include: INCLUDE,
    });
  }

  /**
   * Updates a therapist in one transaction. serviceIds and
   * workingHours, when given, replace the complete list.
   */
  async update(
    id,
    { name, isActive, serviceIds, workingHours }
  ) {
    return prisma.$transaction(async (tx) => {
      const fields = {};

      if (name !== undefined) {
        fields.name = name;
      }

      if (isActive !== undefined) {
        fields.isActive = isActive;
      }

      await tx.therapist.update({
        where: { id },
        data: fields,
      });

      if (serviceIds !== undefined) {
        await tx.therapistMassageService.deleteMany({
          where: { therapistId: id },
        });

        await tx.therapistMassageService.createMany({
          data: serviceIds.map(
            (massageServiceId) => ({
              therapistId: id,
              massageServiceId,
            })
          ),
        });
      }

      if (workingHours !== undefined) {
        await tx.therapistWorkingHour.deleteMany({
          where: { therapistId: id },
        });

        await tx.therapistWorkingHour.createMany({
          data: toWorkingHourRows(id, workingHours),
        });
      }

      return tx.therapist.findUnique({
        where: { id },
        include: INCLUDE,
      });
    });
  }
}

export default new TherapistRepository();
