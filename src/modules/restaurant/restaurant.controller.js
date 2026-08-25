import restaurantService from "../restaurant/restaurant.service.js";
import {
  updateRestaurantSchema,
} from "./restaurant.validator.js";

class RestaurantController {
  /**
   * Creates a new restaurant.
   */
  async createRestaurant(request, reply) {
    const restaurant =
      await restaurantService.createRestaurant(
        request.body
      );

    return reply.status(201).send({
      success: true,
      data: restaurant,
    });
  }

  /**
   * Retrieves the restaurant belonging
   * to the authenticated user.
   */
  async getMyRestaurant(request, reply) {
    const restaurant =
      await restaurantService.findForUser(
        request.user.restaurantId
      );

    return reply.send({
      success: true,
      data: restaurant,
    });
  }

  /**
   * Updates the restaurant belonging
   * to the authenticated user.
   */
  async updateMyRestaurant(request, reply) {
    const restaurantData =
      updateRestaurantSchema.parse(
        request.body
      );

    const restaurant =
      await restaurantService.updateForUser(
        request.user.restaurantId,
        restaurantData
      );

    return reply.send({
      success: true,
      data: restaurant,
    });
  }
}

export default new RestaurantController();