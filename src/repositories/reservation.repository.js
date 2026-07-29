import prisma from "../database/prisma.js";

class ReservationRepository {
  async findOverlappingReservations(
    restaurantId,
    startTime,
    endTime
  ) {
    return prisma.reservation.findMany({
      where: {
        restaurantId,
        status: "CONFIRMED",

        startTime: {
          lt: endTime,
        },

        endTime: {
          gt: startTime,
        },
      },

      orderBy: {
        startTime: "asc",
      },
    });
  }
}

export default new ReservationRepository();