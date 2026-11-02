import businessController from "../business/business.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";

export default async function businessRoutes(
  fastify
) {
  // ====================================================
  // Public
  // ====================================================

  fastify.post(
    "/",
    businessController.createBusiness
  );

  // ====================================================
  // Authenticated business settings
  // ====================================================

  fastify.get(
    "/me",
    {
      preHandler: authenticate,
    },
    businessController.getMyBusiness.bind(
      businessController
    )
  );

  fastify.put(
    "/me",
    {
      preHandler: authenticate,
    },
    businessController.updateMyBusiness.bind(
      businessController
    )
  );
}