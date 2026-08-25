import restaurantController from "../restaurant/restaurant.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";

export default async function restaurantRoutes(
  fastify
) {
  // ====================================================
  // Public
  // ====================================================

  fastify.post(
    "/",
    restaurantController.createRestaurant
  );

  // ====================================================
  // Authenticated restaurant settings
  // ====================================================

  fastify.get(
    "/me",
    {
      preHandler: authenticate,
    },
    restaurantController.getMyRestaurant.bind(
      restaurantController
    )
  );

  fastify.put(
    "/me",
    {
      preHandler: authenticate,
    },
    restaurantController.updateMyRestaurant.bind(
      restaurantController
    )
  );
}