import publicBookingService
  from "./public-booking.service.js";
import restaurantRepository from "../restaurant/restaurant.repository.js";
import reservationService from "../reservation/reservation.service.js";

import {
  publicAvailabilitySchema,
} from "./public-booking.validator.js";
import {
  createReservationSchema,
} from "../reservation/reservation.validator.js";
import NotFoundError from "../../errors/NotFoundError.js";
import { ErrorCodes } from "../../errors/error-codes.js";

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

    const restaurant =
      await restaurantRepository.findBySlug(slug);

    if (!restaurant) {
      throw new NotFoundError(
        "Restaurant not found.",
        ErrorCodes.RESTAURANT_NOT_FOUND
      );
    }

    const reservation =
      createReservationSchema
        .omit({
          restaurantId: true,
        })
        .parse(request.body);

    const createdReservation =
      await reservationService.createReservation({
        ...reservation,
        restaurantId: restaurant.id,
      });

    return reply.status(201).send({
      success: true,
      data: createdReservation,
    });
  }
}

export default new PublicBookingController();