import tableService from "./table.service.js";

class TableController {
  /**
   * GET /businesses/:businessId/tables
   *
   * Returns all tables belonging to the business.
   */
  async getTables(request, reply) {
    const { businessId } = request.params;

    const tables = await tableService.getTables(
      businessId
    );

    return reply.send(tables);
  }

  /**
   * POST /businesses/:businessId/tables
   *
   * Creates a new table.
   */
  async createTable(request, reply) {
    const { businessId } = request.params;

    const table = await tableService.createTable(
      businessId,
      request.body
    );

    return reply.code(201).send(table);
  }

  /**
   * PATCH /businesses/:businessId/tables/:tableId
   *
   * Updates a table's configuration or position.
   */
  async updateTable(request, reply) {
    const { businessId, tableId } =
      request.params;

    const table = await tableService.updateTable(
      businessId,
      tableId,
      request.body
    );

    return reply.send(table);
  }

  /**
   * DELETE /businesses/:businessId/tables/:tableId
   *
   * Deactivates a table.
   */
  async deleteTable(request, reply) {
    const { businessId, tableId } =
      request.params;

    await tableService.deleteTable(
      businessId,
      tableId
    );

    return reply.code(204).send();
  }
}

export default new TableController();