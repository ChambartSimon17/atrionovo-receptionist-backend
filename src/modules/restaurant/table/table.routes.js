import tableController from "./table.controller.js";

export default async function tableRoutes(fastify) {
  fastify.get(
    "/:restaurantId/tables",
    tableController.getTables.bind(tableController)
  );

  fastify.post(
    "/:restaurantId/tables",
    tableController.createTable.bind(tableController)
  );

  fastify.patch(
    "/:restaurantId/tables/:tableId",
    tableController.updateTable.bind(tableController)
  );

  fastify.delete(
    "/:restaurantId/tables/:tableId",
    tableController.deleteTable.bind(tableController)
  );
}