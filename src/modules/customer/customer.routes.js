import customerController from "./customer.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";

// ======================================================
// Customer Routes
// ======================================================
//
// Responsibility
// Define HTTP routes related to customers.
//
// Route groups
//
// Dashboard
// - Requires authentication
// - Restaurant is derived from request.user
//
// Receptionist / VAPI
// - Uses the restaurantId supplied by the caller
// - Kept separate from dashboard customer management
// ======================================================

export default async function customerRoutes(
  fastify
) {
  // ====================================================
  // Dashboard / authenticated routes
  // ====================================================

  fastify.get(
    "/",
    {
      preHandler: authenticate,
    },
    customerController.getCustomers
  );

  fastify.get(
    "/search-by-name",
    {
      preHandler: authenticate,
    },
    customerController.searchCustomers
  );

  fastify.get(
    "/:id",
    {
      preHandler: authenticate,
    },
    customerController.getCustomer
  );

  fastify.patch(
    "/:id",
    {
      preHandler: authenticate,
    },
    customerController.updateCustomer
  );

  fastify.delete(
    "/:id",
    {
      preHandler: authenticate,
    },
    customerController.deleteCustomer
  );

  // ====================================================
  // Receptionist / VAPI routes
  // ====================================================

  fastify.post(
    "/",
    customerController.createCustomer
  );

  fastify.get(
    "/search",
    customerController.findCustomer
  );

  fastify.get(
    "/profile",
    customerController.getCallerProfile
  );
}