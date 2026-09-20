import prisma from "../../db/prisma.js";
import {
  getUtcRangeForLocalDay,
} from "../../utils/time.utils.js";

class ReservationRepository {
  async findRestaurantById(
    restaurantId,
    db = prisma
  ) {
    return db.restaurant.findUnique({
      where: {
        id: restaurantId,
      },
    });
  }

  async findById(
    id,
    db = prisma
  ) {
    return db.reservation.findUnique({
      where: {
        id,
      },
    });
  }

  /**
   * Finds a reservation by ID while also
   * verifying that it belongs to the
   * specified restaurant.
   *
   * This is used for restaurant-scoped
   * reservation operations.
   */
  async findByIdForRestaurant(
    id,
    restaurantId,
    db = prisma
  ) {
    return db.reservation.findFirst({
      where: {
        id,
        restaurantId,
      },
    });
  }

  async findOverlappingReservations(
    restaurantId,
    startTime,
    endTime,
    db = prisma
  ) {
    return db.reservation.findMany({
      where: {
        restaurantId,

        status: {
          in: [
            "CONFIRMED",
            "SEATED",
          ],
        },

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

  async create(
    data,
    db = prisma
  ) {
    return db.reservation.create({
      data,
    });
  }

  async createWithTables(
    reservationData,
    tableIds,
    db = prisma
  ) {
    return db.reservation.create({
      data: {
        ...reservationData,

        tables: {
          create: tableIds.map(
            (tableId) => ({
              table: {
                connect: {
                  id: tableId,
                },
              },
            })
          ),
        },
      },

      include: {
        tables: {
          include: {
            table: true,
          },
        },
      },
    });
  }

  async update(
    id,
    reservationData,
    db = prisma
  ) {
    return db.reservation.update({
      where: {
        id,
      },
      data: reservationData,
    });
  }

  async delete(
    id,
    db = prisma
  ) {
    return db.reservation.delete({
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
  }, db = prisma) {
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

    return db.reservation.findMany({
      where,
      orderBy: {
        startTime: "asc",
      },
    });
  }

  async findUpcomingForRestaurant(
    restaurantId,
    db = prisma
  ) {
    return db.reservation.findMany({
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
   * Retrieves all active reservations for a restaurant
   * on a specific calendar day.
   *
   * Both CONFIRMED and SEATED reservations are included
   * because seated reservations must remain visible in
   * the restaurant's operational reservation list.
   *
   * Reservations earlier today are included as well.
   */
  async findForRestaurantByDay(
    restaurantId,
    date,
    timezone,
    db = prisma
  ) {
    const {
      start,
      end,
    } = getUtcRangeForLocalDay(
      date,
      timezone
    );

    return db.reservation.findMany({
      where: {
        restaurantId,

        status: {
          in: [
            "CONFIRMED",
            "SEATED",
          ],
        },

        startTime: {
          gte: start,
          lt: end,
        },
      },

      orderBy: {
        startTime: "asc",
      },

      include: {
        tables: {
          include: {
            table: true,
          },
        },
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
    timezone,
    db = prisma
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

    const nextMonthDay =
      `${nextMonthYear}-${nextMonth}-01`;

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

    return db.reservation.findMany({
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

  /**
   * Marks a reservation as seated.
   *
   * The restaurant ownership and current
   * reservation status are validated by the
   * service before this method is called.
   */
  async markAsSeated(
    reservationId,
    db = prisma
  ) {
    return db.reservation.update({
      where: {
        id: reservationId,
      },

      data: {
        status: "SEATED",
      },
    });
  }

  /**
   * Marks a reservation as completed.
   *
   * The restaurant ownership and current
   * reservation status are validated by the
   * service before this method is called.
   */
  async markAsCompleted(
    reservationId,
    db = prisma
  ) {
    return db.reservation.update({
      where: {
        id: reservationId,
      },

      data: {
        status: "COMPLETED",
      },
    });
  }
}

export default new ReservationRepository();