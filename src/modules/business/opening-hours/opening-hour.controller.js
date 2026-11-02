import openingHourService from "./opening-hour.service.js";
import { replaceOpeningHoursSchema } from "./opening-hour.validator.js";

// ======================================================
// Opening Hour Controller
// ======================================================
//
// Responsibility
// Handle HTTP requests related to a business's
// weekly opening schedule.
//
// Responsibilities
// - Validate incoming requests
// - Delegate business logic to the service
// - Return HTTP responses
//
// This controller contains no business logic.
// ======================================================

class OpeningHourController {
  /**
   * Retrieves the business's complete weekly
   * opening schedule.
   */
  async findSchedule(request, reply) {
    const { businessId } = request.params;

    const schedule =
      await openingHourService.findSchedule(
        businessId
      );

    return reply.code(200).send(schedule);
  }

  /**
   * Replaces the business's complete weekly
   * opening schedule.
   */
  async replaceSchedule(request, reply) {
    const { businessId } = request.params;

    const { openingHours } =
      replaceOpeningHoursSchema.parse(
        request.body
      );

    const schedule =
      await openingHourService.replaceSchedule(
        businessId,
        openingHours
      );

    return reply.code(200).send(schedule);
  }
}

export default new OpeningHourController();