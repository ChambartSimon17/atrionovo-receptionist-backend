import prisma from "../database/prisma.js";

class ReservationRepository {
  async findByRestaurantId(restaurantId) {
    return prisma.restaurant.findUnique({
      where: {
        id: restaurantId,
      },
    });
  }

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