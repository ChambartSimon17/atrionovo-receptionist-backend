import prisma from "../../db/prisma.js";

// ======================================================
// Treatment Room Repository
// ======================================================
//
// Responsibility
// Persist and retrieve treatment rooms together with the
// massages that can be performed in them.
//
// Every query includes businessId, so a room of another
// business can never be reached through here.
// ======================================================

const INCLUDE = {
  services: {
    select: {
      massageServiceId: true,
    },
  },
};

class TreatmentRoomRepository {
  async findAllForBusiness(
    businessId,
    { includeInactive = false } = {}
  ) {
    return prisma.treatmentRoom.findMany({
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
    return prisma.treatmentRoom.findFirst({
      where: {
        id,
        businessId,
      },
      include: INCLUDE,
    });
  }

  async findByName(businessId, name) {
    return prisma.treatmentRoom.findUnique({
      where: {
        businessId_name: {
          businessId,
          name,
        },
      },
    });
  }

  async create(businessId, { name, serviceIds }) {
    return prisma.treatmentRoom.create({
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
      },
      include: INCLUDE,
    });
  }

  /**
   * Updates a room in one transaction. serviceIds, when
   * given, replaces the complete list.
   */
  async update(id, { name, isActive, serviceIds }) {
    return prisma.$transaction(async (tx) => {
      const fields = {};

      if (name !== undefined) {
        fields.name = name;
      }

      if (isActive !== undefined) {
        fields.isActive = isActive;
      }

      await tx.treatmentRoom.update({
        where: { id },
        data: fields,
      });

      if (serviceIds !== undefined) {
        await tx.roomMassageService.deleteMany({
          where: { roomId: id },
        });

        await tx.roomMassageService.createMany({
          data: serviceIds.map(
            (massageServiceId) => ({
              roomId: id,
              massageServiceId,
            })
          ),
        });
      }

      return tx.treatmentRoom.findUnique({
        where: { id },
        include: INCLUDE,
      });
    });
  }
}

export default new TreatmentRoomRepository();
