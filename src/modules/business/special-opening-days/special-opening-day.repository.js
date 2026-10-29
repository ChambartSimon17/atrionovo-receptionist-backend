import prisma from "../../../db/prisma.js";

// ======================================================
// Special Opening Day Repository
// ======================================================
//
// Responsibility
// Persist and retrieve a business's
// special opening days.
//
// A special opening day consists of:
//
// - The special day itself
// - One or more opening periods
//
// This repository is responsible only for
// database access.
//
// Business rules belong in
// SpecialOpeningDayService.
// ======================================================

class SpecialOpeningDayRepository {
  /**
   * Retrieves all special opening days
   * for a business.
   */
  async findByBusiness(businessId) {
    return prisma.specialOpeningDay.findMany({
      where: {
        businessId,
      },
      include: {
        openingPeriods: true,
      },
      orderBy: {
        date: "asc",
      },
    });
  }

  /**
   * Retrieves one special opening day.
   */
  async findById(id) {
    return prisma.specialOpeningDay.findUnique({
      where: {
        id,
      },
      include: {
        openingPeriods: true,
      },
    });
  }

  /**
   * Retrieves the special opening day
   * for a specific calendar date.
   */
  async findByBusinessAndDate(
    businessId,
    date
  ) {
    return prisma.specialOpeningDay.findUnique({
      where: {
        businessId_date: {
          businessId,
          date,
        },
      },
      include: {
        openingPeriods: true,
      },
    });
  }

  /**
   * Creates a new special opening day.
   */
  async createSpecialOpeningDay({
    businessId,
    date,
    isClosed,
    openingPeriods,
  }) {
    return prisma.specialOpeningDay.create({
      data: {
        businessId,
        date,
        isClosed,

        openingPeriods: {
          create: openingPeriods,
        },
      },

      include: {
        openingPeriods: true,
      },
    });
  }

  /**
   * Updates a special opening day.
   *
   * Existing opening periods are replaced
   * inside one transaction.
   */
  async updateSpecialOpeningDay(
    id,
    {
      date,
      isClosed,
      openingPeriods,
    }
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.specialOpeningPeriod.deleteMany({
        where: {
          specialOpeningDayId: id,
        },
      });

      await tx.specialOpeningDay.update({
        where: {
          id,
        },
        data: {
          date,
          isClosed,
        },
      });

      if (openingPeriods.length > 0) {
        await tx.specialOpeningPeriod.createMany({
          data: openingPeriods.map((period) => ({
            specialOpeningDayId: id,
            ...period,
          })),
        });
      }

      return tx.specialOpeningDay.findUnique({
        where: {
          id,
        },
        include: {
          openingPeriods: true,
        },
      });
    });
  }

  /**
   * Deletes a special opening day.
   *
   * Opening periods are deleted automatically
   * because of the cascade relation.
   */
  async deleteSpecialOpeningDay(id) {
    return prisma.specialOpeningDay.delete({
      where: {
        id,
      },
    });
  }
}

export default new SpecialOpeningDayRepository();