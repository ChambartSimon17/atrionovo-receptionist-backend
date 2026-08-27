import prisma from "../../db/prisma.js";
import {
  getUtcRangeForLocalDay,
} from "../../utils/time.utils.js";

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

  async findUpcomingForRestaurant(
    restaurantId
  ) {
    return prisma.reservation.findMany({
      where: {
        restaurantId,
        status: "CONFIRMED",
        startTime: {
          gte: new Date(),
        },
      },

      orderBy: {
        startTime: "asc",
      },
    });
  }

  /**
   * Retrieves all confirmed reservations for a restaurant
   * on a specific calendar day.
   *
   * The reservation time itself does not matter.
   * Reservations earlier today are included as well.
   */
  async findForRestaurantByDay(
    restaurantId,
    date,
    timezone
  ) {
    const {
      start,
      end,
    } = getUtcRangeForLocalDay(
      date,
      timezone
    );

    return prisma.reservation.findMany({
      where: {
        restaurantId,
        status: "CONFIRMED",

        startTime: {
          gte: start,
          lt: end,
        },
      },

      orderBy: {
        startTime: "asc",
      },
    });
  } 
}

export default new ReservationRepository();