import prisma from "../../../db/prisma.js";

class TableRepository {
  /**
   * Retrieves all active tables for a restaurant.
   */
  async findActiveTablesForRestaurant(
    restaurantId,
    db = prisma
  ) {
    return db.table.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
      orderBy: {
        capacity: "asc",
      },
    });
  }

  /**
   * Retrieves reservations occupying a table
   * during the requested time period.
   */
  async findTableReservations(
    tableId,
    startTime,
    endTime,
    ignoreReservationId,
    db = prisma
  ) {
    return db.reservationTable.findMany({
      where: {
        tableId,

        reservation: {
          status: "CONFIRMED",

          ...(ignoreReservationId && {
            id: {
              not: ignoreReservationId,
            },
          }),

          startTime: {
            lt: endTime,
          },

          endTime: {
            gt: startTime,
          },
        },
      },

      include: {
        reservation: true,
      },
    });
  }

  /**
   * Deletes all table assignments for a reservation.
   */
  async deleteReservationTables(
    reservationId,
    db = prisma
  ) {
    return db.reservationTable.deleteMany({
      where: {
        reservationId,
      },
    });
  }

  /**
   * Creates table assignments for a reservation.
   */
  async createReservationTables(
    reservationId,
    tables,
    db = prisma
  ) {
    return db.reservationTable.createMany({
      data: tables.map((table) => ({
        reservationId,
        tableId: table.id,
      })),
    });
  }
}

export default new TableRepository();