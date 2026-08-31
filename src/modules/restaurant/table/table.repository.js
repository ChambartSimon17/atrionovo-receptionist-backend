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

  async findTableReservations(tableId, startTime, endTime) {
    return prisma.reservationTable.findMany({
      where: {
        tableId,

        reservation: {
          status: "CONFIRMED",

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
}

export default new TableRepository();