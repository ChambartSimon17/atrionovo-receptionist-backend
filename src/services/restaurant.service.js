import restaurantRepository from "../repositories/restaurant.repository.js";
import ConflictError from "../errors/ConflictError.js";

class RestaurantService {
  async createRestaurant({
    name,
    slug,
    maxCapacity,
    timezone,
    language,
  }) {
    const existingRestaurant =
      await restaurantRepository.findBySlug(slug);

    if (existingRestaurant) {
      throw new ConflictError("Restaurant slug already exists");
    }

    return restaurantRepository.create({
      name,
      slug,
      maxCapacity,
      timezone,
      language,
    });
  }
}

export default new RestaurantService();