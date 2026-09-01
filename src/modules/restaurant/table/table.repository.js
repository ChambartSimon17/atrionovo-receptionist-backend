import prisma from "../../../db/prisma.js";

class TableRepository {
  async findActiveTablesForRestaurant(restaurantId) {
    return prisma.table.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
      orderBy: {
        capacity: "asc",
      },
    });
  }

  async findTableReservations(
    tableId,
    startTime,
    endTime,
    ignoreReservationId
  ) {
    return prisma.reservationTable.findMany({
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

  async deleteReservationTables(reservationId) {
    return prisma.reservationTable.deleteMany({
      where: {
        reservationId,
      },
    });
  }

  async createReservationTables(
    reservationId,
    tables
  ) {
    return prisma.reservationTable.createMany({
      data: tables.map((table) => ({
        reservationId,
        tableId: table.id,
      })),
    });
  }
}

export default new TableRepository();