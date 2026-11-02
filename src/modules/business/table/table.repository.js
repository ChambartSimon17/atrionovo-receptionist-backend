import prisma from "../../../db/prisma.js";

class TableRepository {
  /**
   * Retrieves all tables for a business.
   */
  async findAllForBusiness(
    businessId,
    db = prisma
  ) {
    return db.table.findMany({
      where: {
        businessId,
        isActive: true,
      },
      orderBy: {
        name: "asc",
      },
    });
  }

  /**
   * Retrieves a single table belonging to a business.
   *
   * Including businessId in the query guarantees that
   * a table from another business cannot be accessed
   * through this repository method.
   */
  async findById(
    tableId,
    businessId,
    db = prisma
  ) {
    return db.table.findFirst({
      where: {
        id: tableId,
        businessId,
      },
    });
  }

  /**
   * Creates a table for a business.
   */
  async create(
    businessId,
    data,
    db = prisma
  ) {
    return db.table.create({
      data: {
        businessId,
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
   * Updates a table belonging to a business.
   */
  async update(
    tableId,
    businessId,
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
    businessId,
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
   * Retrieves all active tables for a business.
   */
  async findActiveTablesForBusiness(
    businessId,
    db = prisma
  ) {
    return db.table.findMany({
      where: {
        businessId,
        isActive: true,
      },
      orderBy: {
        capacity: "asc",
      },
    });
  }

  async findActiveReservationsForTable(tableId, db = prisma) {
    const now = new Date();

    return db.reservationTable.findMany({
      where: {
        tableId,
        reservation: {
          status: {
            in: ["CONFIRMED", "SEATED"],
          },
          endTime: {
            gt: now,
          },
        },
      },
      include: {
        reservation: {
          include: {
            tables: true,
          },
        },
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