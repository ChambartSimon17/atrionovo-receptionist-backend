import tableRepository from "./table.repository.js";
import restaurantRepository from "../restaurant.repository.js";
import reservationRepository from "../../reservation/reservation.repository.js";
import tableAssignmentService from "./table-assignment.service.js";
import NotFoundError from "../../../errors/NotFoundError.js";
import ValidationError from "../../../errors/ValidationError.js";
import ConflictError from "../../../errors/ConflictError.js";
import { ErrorCodes } from "../../../errors/error-codes.js";
import { runTransaction } from "../../../utils/transaction.utils.js";

const VALID_TABLE_SHAPES = [
  "ROUND",
  "SQUARE",
  "RECTANGLE",
];

class TableService {
  /**
   * Retrieves all tables belonging to a restaurant.
   *
   * Used by the restaurant dashboard to load
   * the restaurant floor plan.
   */
  async getTables(restaurantId) {
    await this.#validateRestaurant(restaurantId);

    return tableRepository.findAllForRestaurant(
      restaurantId
    );
  }

  /**
   * Creates a new table for a restaurant.
   *
   * The table stores both operational information,
   * such as capacity, and visual information,
   * such as position, size, shape, and rotation.
   */
  async createTable(restaurantId, data) {
    await this.#validateRestaurant(restaurantId);

    this.#validateTableData(data);

    return tableRepository.create(
      restaurantId,
      data
    );
  }

  /**
   * Updates an existing table.
   *
   * The table must belong to the requested restaurant.
   *
   * Only explicitly supported table fields are passed
   * to the repository.
   */
  async updateTable(
    restaurantId,
    tableId,
    data
  ) {
    await this.#validateRestaurant(restaurantId);

    const table = await tableRepository.findById(
      tableId,
      restaurantId
    );

    if (!table) {
      throw new NotFoundError(
        "Table not found.",
        ErrorCodes.TABLE_NOT_FOUND
      );
    }

    this.#validateTableData(data, true);

    const updateData = {};

    if (data.name !== undefined) {
      updateData.name = data.name;
    }

    if (data.capacity !== undefined) {
      updateData.capacity = data.capacity;
    }

    if (data.shape !== undefined) {
      updateData.shape = data.shape;
    }

    if (data.x !== undefined) {
      updateData.x = data.x;
    }

    if (data.y !== undefined) {
      updateData.y = data.y;
    }

    if (data.width !== undefined) {
      updateData.width = data.width;
    }

    if (data.height !== undefined) {
      updateData.height = data.height;
    }

    if (data.rotation !== undefined) {
      updateData.rotation = data.rotation;
    }

    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }

    return tableRepository.update(
      tableId,
      restaurantId,
      updateData
    );
  }

  /**
   * Deactivates a table instead of physically deleting it.
   *
   * Existing reservations can therefore keep their
   * historical table assignment.
   */
  async deleteTable(
    restaurantId,
    tableId
  ) {
    return runTransaction(async (db) => {
      const table =
        await tableRepository.findById(
          tableId,
          restaurantId,
          db
        );

      if (!table) {
        throw new NotFoundError(
          "Tafel niet gevonden.",
          ErrorCodes.TABLE_NOT_FOUND
        );
      }

      if (!table.isActive) {
        return table;
      }

      const affectedReservations =
        await tableRepository.findActiveReservationsForTable(
          tableId,
          db
        );

      const seatedReservations =
        affectedReservations.filter(
          ({ reservation }) =>
            reservation.status === "SEATED"
        );

      if (seatedReservations.length > 0) {
        throw new ConflictError(
          "Deze tafel kan niet worden gedeactiveerd omdat er nog een gezelschap aan tafel zit."
        );
      }

      const confirmedReservations =
        affectedReservations.filter(
          ({ reservation }) =>
            reservation.status === "CONFIRMED"
        );

      for (const {
        reservation,
      } of confirmedReservations) {
        const assignment =
          await tableAssignmentService.assignTables({
            restaurantId,
            guestCount:
              reservation.guestCount,
            startTime:
              reservation.startTime,
            endTime:
              reservation.endTime,
            ignoreReservationId:
              reservation.id,
            excludeTableId: tableId,
            db,
          });

        if (!assignment) {
          throw new ConflictError(
            `De tafel kan niet worden gedeactiveerd omdat reservatie ${reservation.id} geen nieuwe tafelcombinatie heeft.`
          );
        }

        await reservationRepository.replaceTables(
          reservation.id,
          assignment.tables.map(
            (table) => table.id
          ),
          db
        );
      }

      return tableRepository.deactivate(
        tableId,
        restaurantId,
        db
      );
    });
  }

  /**
   * Verifies that the restaurant exists before
   * performing a table operation.
   */
  async #validateRestaurant(restaurantId) {
    const restaurant =
      await restaurantRepository.findById(
        restaurantId
      );

    if (!restaurant) {
      throw new NotFoundError(
        "Restaurant not found.",
        ErrorCodes.RESTAURANT_NOT_FOUND
      );
    }

    return restaurant;
  }

  /**
   * Validates table configuration data.
   *
   * During creation, name is required.
   * During updates, only fields that are supplied
   * are validated.
   */
  #validateTableData(
    data,
    isUpdate = false
  ) {
    if (!data || typeof data !== "object") {
      throw new ValidationError(
        "Table data is required."
      );
    }

    if (
      !isUpdate ||
      data.name !== undefined
    ) {
      if (
        typeof data.name !== "string" ||
        data.name.trim().length === 0
      ) {
        throw new ValidationError(
          "Table name is required."
        );
      }
    }

    if (
      data.capacity !== undefined &&
      (
        !Number.isInteger(data.capacity) ||
        data.capacity <= 0
      )
    ) {
      throw new ValidationError(
        "Table capacity must be a positive integer."
      );
    }

    if (
      data.shape !== undefined &&
      !VALID_TABLE_SHAPES.includes(data.shape)
    ) {
      throw new ValidationError(
        "Table shape must be ROUND, SQUARE, or RECTANGLE."
      );
    }

    if (
      data.x !== undefined &&
      typeof data.x !== "number"
    ) {
      throw new ValidationError(
        "Table x position must be a number."
      );
    }

    if (
      data.y !== undefined &&
      typeof data.y !== "number"
    ) {
      throw new ValidationError(
        "Table y position must be a number."
      );
    }

    if (
      data.width !== undefined &&
      (
        typeof data.width !== "number" ||
        data.width <= 0
      )
    ) {
      throw new ValidationError(
        "Table width must be greater than zero."
      );
    }

    if (
      data.height !== undefined &&
      (
        typeof data.height !== "number" ||
        data.height <= 0
      )
    ) {
      throw new ValidationError(
        "Table height must be greater than zero."
      );
    }

    if (
      data.rotation !== undefined &&
      typeof data.rotation !== "number"
    ) {
      throw new ValidationError(
        "Table rotation must be a number."
      );
    }

    if (
      data.isActive !== undefined &&
      typeof data.isActive !== "boolean"
    ) {
      throw new ValidationError(
        "Table isActive must be a boolean."
      );
    }
  }
}

export default new TableService();