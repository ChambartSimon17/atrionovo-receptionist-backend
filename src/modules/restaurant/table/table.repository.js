import prisma from "../../../db/prisma.js";

class TableRepository {
  /**
   * Retrieves all tables for a restaurant.
   */
  async findAllForRestaurant(
    restaurantId,
    db = prisma
  ) {
    return db.table.findMany({
      where: {
        restaurantId,
      },
      orderBy: {
        name: "asc",
      },
    });
  }

  /**
   * Retrieves a single table belonging to a restaurant.
   *
   * Including restaurantId in the query guarantees that
   * a table from another restaurant cannot be accessed
   * through this repository method.
   */
  async findById(
    tableId,
    restaurantId,
    db = prisma
  ) {
    return db.table.findFirst({
      where: {
        id: tableId,
        restaurantId,
      },
    });
  }

  /**
   * Creates a table for a restaurant.
   */
  async create(
    restaurantId,
    data,
    db = prisma
  ) {
    return db.table.create({
      data: {
        restaurantId,
        name: data.name,
        capacity: data.capacity,
        shape: data.shape,
        x: data.x,
        y: data.y,
        width: data.width,
        height: data.height,
        rotation: data.rotation,
        isActive: data.isActive ?? true,
      },
    });
  }

  /**
   * Updates a table belonging to a restaurant.
   */
  async update(
    tableId,
    restaurantId,
    data,
    db = prisma
  ) {
    return db.table.update({
      where: {
        id: tableId,
      },
      data,
    });
  }

  /**
   * Deactivates a table.
   *
   * We keep the database record so historical reservations
   * remain intact.
   */
  async deactivate(
    tableId,
    restaurantId,
    db = prisma
  ) {
    return db.table.update({
      where: {
        id: tableId,
      },
      data: {
        isActive: false,
      },
    });
  }

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
          status: {
            in: [
              "CONFIRMED",
              "SEATED",
            ],
          },

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