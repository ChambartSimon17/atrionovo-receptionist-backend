import restaurantRepository from "../restaurant/restaurant.repository.js";
import reservationService from "../reservation/reservation.service.js";
import NotFoundError from "../../errors/NotFoundError.js";
import { ErrorCodes } from "../../errors/error-codes.js";

// ======================================================
// Public Booking Service
// ======================================================
//
// Responsibility
// Handle booking operations coming from restaurant
// websites.
//
// This service is intentionally thin.
//
// The actual reservation business logic remains inside
// ReservationService.
// ======================================================

class PublicBookingService {

  /**
   * Finds a restaurant by its public slug and returns
   * only information that is safe for the website widget.
   */
  async getRestaurant(slug) {
    const restaurant =
      await restaurantRepository.findBySlug(
        slug
      );

    if (!restaurant) {
      throw new NotFoundError(
        "Restaurant not found.",
        ErrorCodes.RESTAURANT_NOT_FOUND
      );
    }

    return {
      name: restaurant.name,

      slug: restaurant.slug,

      timezone: restaurant.timezone,

      language: restaurant.language,

      maxReservationSize:
        restaurant.maxReservationSize,

      arrivalIntervalMinutes:
        restaurant.arrivalIntervalMinutes,

      defaultReservationDurationMinutes:
        restaurant.defaultReservationDurationMinutes,
    };
  }

  /**
   * Checks availability for a public website booking.
   */
  async checkAvailability(
    slug,
    bookingData
  ) {
    const restaurant =
      await restaurantRepository.findBySlug(
        slug
      );

    if (!restaurant) {
      throw new NotFoundError(
        "Restaurant not found.",
        ErrorCodes.RESTAURANT_NOT_FOUND
      );
    }

    return reservationService.checkAvailability({
      restaurantId:
        restaurant.id,

      guestCount:
        bookingData.guestCount,

      startTime:
        bookingData.startTime,
    });
  }

  /**
   * Creates a reservation from a public website.
   *
   * The restaurant ID is resolved server-side from
   * the restaurant slug.
   */
  async createReservation(
    slug,
    reservationData
  ) {
    const restaurant =
      await restaurantRepository.findBySlug(
        slug
      );

    if (!restaurant) {
      throw new NotFoundError(
        "Restaurant not found.",
        ErrorCodes.RESTAURANT_NOT_FOUND
      );
    }

    return reservationService.createReservation({
      restaurantId:
        restaurant.id,

      ...reservationData,
    });
  }
}

export default new PublicBookingService();