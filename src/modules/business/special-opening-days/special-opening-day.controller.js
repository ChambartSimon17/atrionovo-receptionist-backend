import specialOpeningDayService from "./special-opening-day.service.js";
import {
  specialOpeningDaySchema,
} from "./special-opening-day.validator.js";

// ======================================================
// Special Opening Day Controller
// ======================================================
//
// Responsibility
// Handle HTTP requests related to a business's
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
   * for a business.
   */
  async findByBusiness(
    request,
    reply
  ) {
    const { businessId } =
      request.params;

    const specialOpeningDays =
      await specialOpeningDayService.findByBusiness(
        businessId
      );

    return reply.send(
      specialOpeningDays
    );
  }

  /**
   * Creates a new special opening day.
   */
  async create(
    request,
    reply
  ) {
    const { businessId } =
      request.params;

    const specialOpeningDay =
      specialOpeningDaySchema.parse(
        request.body
      );

    const created =
      await specialOpeningDayService.create(
        businessId,
        specialOpeningDay
      );

    return reply.status(201).send(
      created
    );
  }

  /**
   * Updates a special opening day.
   */
  async update(
    request,
    reply
  ) {
    const {
      businessId,
      id,
    } = request.params;

    const specialOpeningDay =
      specialOpeningDaySchema.parse(
        request.body
      );

    const updated =
      await specialOpeningDayService.update(
        id,
        businessId,
        specialOpeningDay
      );

    return reply.send(
      updated
    );
  }

  /**
   * Deletes a special opening day.
   */
  async delete(
    request,
    reply
  ) {
    const {
      businessId,
      id,
    } = request.params;

    await specialOpeningDayService.delete(
      id,
      businessId
    );

    return reply.status(204).send();
  }
}

export default new SpecialOpeningDayController();