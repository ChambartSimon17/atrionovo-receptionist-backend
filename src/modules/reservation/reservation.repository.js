import prisma from "../../db/prisma.js";

class ReservationRepository {
  async findRestaurantById(restaurantId) {
    return prisma.restaurant.findUnique({
      where: {
        id: restaurantId,
      },
    });
  }

  async findById(id) {
    return prisma.reservation.findUnique({
      where: {
        id,
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

  async create(data) {
    return prisma.reservation.create({
      data,
    });
  }

  async update(id, reservationData) {
    return prisma.reservation.update({
      where: {
        id,
      },
      data: reservationData,
    });
  }

  async delete(id) {
    return prisma.reservation.delete({
      where: {
        id,
      },
    });
  }

  async findUpcoming({
    restaurantId,
    phoneNumber,
    email,
    lastName,
  }) {
    const where = {
      restaurantId,
      status: "CONFIRMED",
      startTime: {
        gte: new Date(),
      },
    };

    if (phoneNumber) {
      where.phoneNumber = phoneNumber;
    }

    if (email) {
      where.email = email;
    }

    if (lastName) {
      where.lastName = lastName;
    }

    return prisma.reservation.findMany({
      where,
      orderBy: {
        startTime: "asc",
      },
    });
  }
}

export default new ReservationRepository();