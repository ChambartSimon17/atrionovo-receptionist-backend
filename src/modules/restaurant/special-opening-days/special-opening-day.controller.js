import specialOpeningDayService from "./special-opening-day.service.js";
import {
  specialOpeningDaySchema,
} from "./special-opening-day.validator.js";

// ======================================================
// Special Opening Day Controller
// ======================================================
//
// Responsibility
// Handle HTTP requests related to a restaurant's
// special opening days.
//
// Responsibilities
// - Validate incoming requests
// - Delegate business logic to the service
// - Return HTTP responses
//
// This controller contains no business logic.
// ======================================================

class SpecialOpeningDayController {
  /**
   * Retrieves all special opening days
   * for a restaurant.
   */
  async findByRestaurant(request, reply) {
    const { restaurantId } = request.params;

    const specialOpeningDays =
      await specialOpeningDayService.findByRestaurant(
        restaurantId
      );

    return reply.send(specialOpeningDays);
  }

  /**
   * Creates a new special opening day.
   */
  async create(request, reply) {
    const { restaurantId } = request.params;

    const specialOpeningDay =
      specialOpeningDaySchema.parse(request.body);

    const created =
      await specialOpeningDayService.create(
        restaurantId,
        specialOpeningDay
      );

    return reply.status(201).send(created);
  }

  /**
   * Updates a special opening day.
   */
  async update(request, reply) {
    const { id } = request.params;

    const specialOpeningDay =
      specialOpeningDaySchema.parse(request.body);

    const updated =
      await specialOpeningDayService.update(
        id,
        specialOpeningDay
      );

    return reply.send(updated);
  }

  /**
   * Deletes a special opening day.
   */
  async delete(request, reply) {
    const { id } = request.params;

    await specialOpeningDayService.delete(id);

    return reply.status(204).send();
  }
}

export default new SpecialOpeningDayController();