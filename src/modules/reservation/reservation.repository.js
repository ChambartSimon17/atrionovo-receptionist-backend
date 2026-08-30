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

  /**
   * Retrieves all confirmed reservations for a restaurant
   * during a specific calendar month.
   *
   * Converts the local calendar month boundaries to UTC
   * using the specified timezone to account for DST changes
   * and ensure accurate cross-timezone month boundaries.
   *
   * Returns only the startTime for each reservation,
   * suitable for analytics, availability analysis, or
   * generating reservation counts by date.
   *
   * Example:
   * findReservationCountsForMonth(
   *   "rest123",
   *   2026,
   *   8,
   *   "Europe/Brussels"
   * )
   * => Returns all August 2026 reservations in Brussels time
   */
  async findReservationCountsForMonth(
    restaurantId,
    year,
    month,
    timezone
  ) {
    const firstDay = `${year}-${String(
      month
    ).padStart(2, "0")}-01`;

    const nextMonthDate =
      new Date(
        Number(year),
        Number(month),
        1
      );

    const nextMonthYear =
      nextMonthDate.getFullYear();

    const nextMonth =
      String(
        nextMonthDate.getMonth() + 1
      ).padStart(2, "0");

    const nextMonthDay = `${nextMonthYear}-${nextMonth}-01`;

    const {
      start: rangeStart,
    } = getUtcRangeForLocalDay(
      firstDay,
      timezone
    );

    const {
      start: rangeEnd,
    } = getUtcRangeForLocalDay(
      nextMonthDay,
      timezone
    );

    return prisma.reservation.findMany({
      where: {
        restaurantId,

        status: "CONFIRMED",

        startTime: {
          gte: rangeStart,
          lt: rangeEnd,
        },
      },

      select: {
        startTime: true,
      },

      orderBy: {
        startTime: "asc",
      },
    });
  }
  
}

export default new ReservationRepository();