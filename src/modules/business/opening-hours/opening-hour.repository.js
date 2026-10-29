import prisma from "../../../db/prisma.js";

// ======================================================
// Opening Hour Repository
// ======================================================
//
// Responsibility
// Persist and retrieve a business's weekly opening schedule.
//
// This repository is responsible only for database access.
// It does NOT contain business rules or validation.
//
// Business rules such as:
// - Business exists
// - Opening time before closing time
// - No overlapping opening periods
//
// belong in OpeningHourService.
// ======================================================

class OpeningHourRepository {
  /**
   * Replaces the business's complete weekly opening schedule.
   *
   * The operation is executed inside a database transaction to
   * ensure the schedule is never left in a partially updated state.
   */
  async replaceSchedule(businessId, openingHours) {
    await prisma.$transaction(async (tx) => {
      await tx.openingHour.deleteMany({
        where: {
          businessId,
        },
      });

      await tx.openingHour.createMany({
        data: openingHours.map((openingHour) => ({
          businessId,
          ...openingHour,
        })),
      });
    });
  }

    /**
   * Retrieves all opening periods for one business
   * on a specific weekday.
   */
  async findByBusinessAndDay(
    businessId,
    dayOfWeek
  ) {
    return prisma.openingHour.findMany({
      where: {
        businessId,
        dayOfWeek,
      },
      orderBy: {
        opensAtMinutes: "asc",
      },
    });
  }

  /**
   * Retrieves the business's complete weekly opening schedule.
   *
   * Opening hours are ordered first by weekday and then by
   * opening time.
   */
  async findSchedule(businessId) {
    return prisma.openingHour.findMany({
      where: {
        businessId,
      },
      orderBy: [
        {
          dayOfWeek: "asc",
        },
        {
          opensAtMinutes: "asc",
        },
      ],
    });
  }
}

export default new OpeningHourRepository();