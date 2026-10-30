import prisma from "../../db/prisma.js";

// ======================================================
// Massage Service Repository
// ======================================================
//
// Responsibility
// Persist and retrieve massage services.
//
// Every query includes businessId, so a service of
// another business can never be reached through here.
// ======================================================

class MassageServiceRepository {
  /**
   * Retrieves the services of a business.
   * Inactive services are only included when requested.
   */
  async findAllForBusiness(
    businessId,
    { includeInactive = false } = {}
  ) {
    return prisma.massageService.findMany({
      where: {
        businessId,
        ...(includeInactive
          ? {}
          : { isActive: true }),
      },
      orderBy: [
        { isActive: "desc" },
        { name: "asc" },
      ],
    });
  }

  async findById(id, businessId) {
    return prisma.massageService.findFirst({
      where: {
        id,
        businessId,
      },
    });
  }

  async findByName(businessId, name) {
    return prisma.massageService.findUnique({
      where: {
        businessId_name: {
          businessId,
          name,
        },
      },
    });
  }

  async create(businessId, data) {
    return prisma.massageService.create({
      data: {
        businessId,
        ...data,
      },
    });
  }

  async update(id, data) {
    return prisma.massageService.update({
      where: {
        id,
      },
      data,
    });
  }
}

export default new MassageServiceRepository();
