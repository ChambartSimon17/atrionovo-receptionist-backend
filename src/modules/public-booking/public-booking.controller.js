import publicBookingService
  from "./public-booking.service.js";

import {
  publicAvailabilitySchema,
  publicReservationSchema,
} from "./public-booking.validator.js";

// ======================================================
// Public Booking Controller
// ======================================================
//
// HTTP layer for website booking.
//
// No business logic belongs here.
// ======================================================

class PublicBookingController {

  /**
   * Returns public restaurant configuration
   * required by the booking widget.
   */
  async getRestaurant(request, reply) {
    const { slug } =
      request.params;

    const restaurant =
      await publicBookingService.getRestaurant(
        slug
      );

    return reply.send({
      success: true,
      data: restaurant,
    });
  }

  /**
   * Checks availability for the requested
   * date/time and number of guests.
   */
  async checkAvailability(
    request,
    reply
  ) {
    const { slug } =
      request.params;

    const booking =
      publicAvailabilitySchema.parse(
        request.body
      );

    const result =
      await publicBookingService.checkAvailability(
        slug,
        booking
      );

    return reply.send({
      success: true,
      data: result,
    });
  }

  /**
   * Creates a reservation from the restaurant website.
   */
  async createReservation(
    request,
    reply
  ) {
    const { slug } =
      request.params;

    const reservation =
      publicReservationSchema.parse(
        request.body
      );

    const createdReservation =
      await publicBookingService.createReservation(
        slug,
        reservation
      );

    return reply.status(201).send({
      success: true,
      data: createdReservation,
    });
  }
}

export default new PublicBookingController();