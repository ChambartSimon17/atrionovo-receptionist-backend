import restaurantService from "../services/restaurant.service.js";

class RestaurantController {
  async createRestaurant(request, reply) {
    const restaurant = await restaurantService.createRestaurant(request.body);

    return reply.status(201).send({
      success: true,
      data: restaurant,
    });
  }
}

export default new RestaurantController();