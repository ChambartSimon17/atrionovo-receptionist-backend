import authController from "./auth.controller.js";
import {
  authenticate,
} from "../../middleware/auth.middleware.js";

// ======================================================
// Auth Routes
// ======================================================
//
// Responsibility
// Define HTTP routes related to authentication.
// ======================================================

export default async function authRoutes(
  fastify
) {
  fastify.post(
    "/register",
    authController.register.bind(
      authController
    )
  );

  fastify.post(
    "/login",
    authController.login.bind(
      authController
    )
  );

  fastify.post(
    "/refresh",
    authController.refresh.bind(
      authController
    )
  );

  fastify.get(
    "/me",
    {
      preHandler: authenticate,
    },
    authController.getMe.bind(
      authController
    )
  );
}