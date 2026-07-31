import prisma from "../../../db/prisma.js";

// ======================================================
// Opening Hour Repository
// ======================================================
//
// Responsibility
// Persist and retrieve a restaurant's weekly opening schedule.
//
// This repository is responsible only for database access.
// It does NOT contain business rules or validation.
//
// Business rules such as:
// - Restaurant exists
// - Opening time before closing time
// - No overlapping opening periods
//
// belong in OpeningHourService.
// ======================================================

class OpeningHourRepository {
  /**
   * Replaces the restaurant's complete weekly opening schedule.
   *
   * The operation is executed inside a database transaction to
   * ensure the schedule is never left in a partially updated state.
   */
  async replaceSchedule(restaurantId, openingHours) {
    await prisma.$transaction(async (tx) => {
      await tx.openingHour.deleteMany({
        where: {
          restaurantId,
        },
      });

      await tx.openingHour.createMany({
        data: openingHours.map((openingHour) => ({
          restaurantId,
          ...openingHour,
        })),
      });
    });
  }

  /**
   * Retrieves the restaurant's complete weekly opening schedule.
   *
   * Opening hours are ordered first by weekday and then by
   * opening time.
   */
  async findSchedule(restaurantId) {
    return prisma.openingHour.findMany({
      where: {
        restaurantId,
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