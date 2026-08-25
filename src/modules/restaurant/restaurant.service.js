import restaurantRepository from "../restaurant/restaurant.repository.js";
import ConflictError from "../../errors/ConflictError.js";
import NotFoundError from "../../errors/NotFoundError.js";
import { ErrorCodes } from "../../errors/error-codes.js";

class RestaurantService {
  /**
   * Creates a new restaurant.
   */
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
      throw new ConflictError(
        "Restaurant slug already exists"
      );
    }

    return restaurantRepository.create({
      name,
      slug,
      maxCapacity,
      timezone,
      language,
    });
  }

  /**
   * Retrieves a restaurant by ID.
   */
  async findById(id) {
    const restaurant =
      await restaurantRepository.findById(id);

    if (!restaurant) {
      throw new NotFoundError(
        "Restaurant not found.",
        ErrorCodes.RESTAURANT_NOT_FOUND
      );
    }

    return restaurant;
  }

  /**
   * Retrieves the restaurant belonging to
   * the authenticated user.
   */
  async findForUser(restaurantId) {
    return this.findById(restaurantId);
  }

  /**
   * Updates the restaurant belonging to
   * the authenticated user.
   *
   * The restaurant ID is supplied by the
   * authentication layer, not by the client.
   */
  async updateForUser(
    restaurantId,
    restaurantData
  ) {
    await this.findById(restaurantId);

    return restaurantRepository.update(
      restaurantId,
      restaurantData
    );
  }
}

export default new RestaurantService();