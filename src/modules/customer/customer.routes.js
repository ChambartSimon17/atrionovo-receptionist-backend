import customerController from "./customer.controller.js";

export default async function customerRoutes(fastify) {
  fastify.post(
    "/",
    customerController.createCustomer
  );

  fastify.get(
    "/search",
    customerController.findCustomer
  );

  fastify.put(
    "/:id",
    customerController.updateCustomer
  );

  fastify.delete(
    "/:id",
    customerController.deleteCustomer
  );

  fastify.get(
    "/profile",
    customerController.getCallerProfile
  );
}