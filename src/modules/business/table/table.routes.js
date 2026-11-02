import tableController from "./table.controller.js";

export default async function tableRoutes(fastify) {
  fastify.get(
    "/:businessId/tables",
    tableController.getTables.bind(tableController)
  );

  fastify.post(
    "/:businessId/tables",
    tableController.createTable.bind(tableController)
  );

  fastify.patch(
    "/:businessId/tables/:tableId",
    tableController.updateTable.bind(tableController)
  );

  fastify.delete(
    "/:businessId/tables/:tableId",
    tableController.deleteTable.bind(tableController)
  );
}