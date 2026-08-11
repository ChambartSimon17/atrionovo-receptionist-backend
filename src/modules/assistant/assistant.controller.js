import assistantService from "./assistant.service.js";
import {
  callerProfileSchema,
  checkAvailabilitySchema,
  createReservationSchema,
  updateReservationSchema,
  cancelReservationSchema,
} from "./assistant.validator.js";

// ======================================================
// Assistant Controller
// ======================================================
//
// Responsibility
// Handle AI assistant requests.
//
// This controller validates requests and delegates
// orchestration to the Assistant Service.
// ======================================================

class AssistantController {
  /**
   * Retrieves the caller profile.
   */
  async getCallerProfile(request, reply) {
    const body =
      callerProfileSchema.parse(
        request.body
      );

    const profile =
      await assistantService.getCallerProfile({
        restaurantId:
          request.headers["x-restaurant-id"],
        ...body,
      });

    return reply.send({
      success: true,
      data: profile,
    });
  }

  /**
   * Checks reservation availability.
   */
  async checkAvailability(request, reply) {
    const body =
      checkAvailabilitySchema.parse(
        request.body
      );

    const result =
      await assistantService.checkAvailability({
        restaurantId:
          request.headers["x-restaurant-id"],
        ...body,
      });

    return reply.send({
      success: true,
      data: result,
    });
  }

  /**
   * Creates a new reservation.
   */
  async createReservation(
    request,
    reply
  ) {
    const body =
      createReservationSchema.parse(
        request.body
      );
      
    const reservation =
      await assistantService.createReservation({
        restaurantId:
          request.headers["x-restaurant-id"],
        ...body,
      });
      
    return reply.send({
        success: true,
        data: reservation,
    });
  }

  /**
   * Updates an existing reservation.
   */
  async updateReservation(request, reply) {
    const body =
      updateReservationSchema.parse(
        request.body
      );

    const result =
      await assistantService.updateReservation({
        restaurantId:
          request.headers["x-restaurant-id"],
        ...body,
      });

    return reply.send({
      success: true,
      data: result,
    });
  }
  
  async cancelReservation(request, reply) {
    const body =
        cancelReservationSchema.parse(
            request.body
        );

    const result =
        await assistantService.cancelReservation(
            body
        );

    return reply.send({
        success: true,
        data: result,
    });
  }
}

export default new AssistantController();