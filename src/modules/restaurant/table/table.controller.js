import tableService from "./table.service.js";

class TableController {
  /**
   * GET /restaurants/:restaurantId/tables
   *
   * Returns all tables belonging to the restaurant.
   */
  async getTables(request, reply) {
    const { restaurantId } = request.params;

    const tables = await tableService.getTables(
      restaurantId
    );

    return reply.send(tables);
  }

  /**
   * POST /restaurants/:restaurantId/tables
   *
   * Creates a new table.
   */
  async createTable(request, reply) {
    const { restaurantId } = request.params;

    const table = await tableService.createTable(
      restaurantId,
      request.body
    );

    return reply.code(201).send(table);
  }

  /**
   * PATCH /restaurants/:restaurantId/tables/:tableId
   *
   * Updates a table's configuration or position.
   */
  async updateTable(request, reply) {
    const { restaurantId, tableId } =
      request.params;

    const table = await tableService.updateTable(
      restaurantId,
      tableId,
      request.body
    );

    return reply.send(table);
  }

  /**
   * DELETE /restaurants/:restaurantId/tables/:tableId
   *
   * Deactivates a table.
   */
  async deleteTable(request, reply) {
    const { restaurantId, tableId } =
      request.params;

    await tableService.deleteTable(
      restaurantId,
      tableId
    );

    return reply.code(204).send();
  }
}

export default new TableController();