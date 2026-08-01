import restaurantRepository from "../restaurant/restaurant.repository.js";
import reservationRepository from "../reservation/reservation.repository.js";
import openingHourRepository from "../restaurant/opening-hours/opening-hour.repository.js";
import { dateToMinutes, dateToDayOfWeek } from "../../utils/time.utils.js";
import NotFoundError from "../../errors/NotFoundError.js";
import ValidationError from "../../errors/ValidationError.js";

// ======================================================
// Reservation Eligibility Service
// ======================================================
//
// Responsibility
// Determine whether a reservation can be accepted.
//
// This service evaluates all restaurant business rules
// before a reservation is created.
//
// Current Rules
// - Restaurant exists
// - Reservation falls within opening hours
// - Restaurant has sufficient capacity
//
// Future Rules
// - Arrival slot limits
// - Holidays
// - Special opening hours
// - Maximum party size
// ======================================================

class ReservationEligibilityService {
  /**
   * Determines whether a reservation can be accepted.
   *
   * Throws a business error when one of the
   * eligibility rules is violated.
   */
  async checkEligibility({
    restaurantId,
    guestCount,
    startTime,
    endTime,
  }) {
    const restaurant = await this.#getRestaurant(restaurantId);

    await this.#validateOpeningHours({
      restaurant,
      startTime,
      endTime,
    });

    await this.#validateCapacity({
      restaurant,
      guestCount,
      startTime,
      endTime,
    });

    return {
      eligible: true,
    };
  }

  /**
   * Retrieves the restaurant.
   *
   * Throws a NotFoundError when the restaurant
   * does not exist.
   */
  async #getRestaurant(restaurantId) {
    const restaurant =
      await restaurantRepository.findById(restaurantId);

    if (!restaurant) {
      throw new NotFoundError("Restaurant not found.");
    }

    return restaurant;
  }

  /**
   * Ensures the reservation fits completely inside
   * one opening period of the restaurant.
   */
  async #validateOpeningHours({
    restaurant,
    startTime,
    endTime,
  }) {
    const reservationStart = new Date(startTime);
    const reservationEnd = new Date(endTime);

    const dayOfWeek = dateToDayOfWeek(
      reservationStart,
      restaurant.timezone
    );

    const openingHours =
      await openingHourRepository.findByRestaurantAndDay(
        restaurant.id,
        dayOfWeek
      );

    if (openingHours.length === 0) {
      throw new ValidationError(
        "Restaurant is closed on this day."
      );
    }

    const startMinutes = dateToMinutes(
      reservationStart,
      restaurant.timezone
    );

    const endMinutes = dateToMinutes(
      reservationEnd,
      restaurant.timezone
    );

    const fitsOpeningPeriod = openingHours.some(
      (openingHour) =>
        startMinutes >= openingHour.opensAtMinutes &&
        endMinutes <= openingHour.closesAtMinutes
    );

    if (!fitsOpeningPeriod) {
      throw new ValidationError(
        "Reservation falls outside opening hours."
      );
    }
  }

  /**
   * Ensures the restaurant has enough
   * remaining capacity.
   */
  async #validateCapacity({
    restaurant,
    guestCount,
    startTime,
    endTime,
  }) {
    const reservations =
      await reservationRepository.findOverlappingReservations(
        restaurant.id,
        startTime,
        endTime
      );

    const occupiedSeats =
      this.#calculateOccupiedSeats(reservations);

    if (
      occupiedSeats + guestCount >
      restaurant.maxCapacity
    ) {
      throw new ValidationError(
        "Restaurant capacity exceeded."
      );
    }
  }

  /**
   * Calculates the total number of occupied seats
   * for the requested reservation period.
   */
  #calculateOccupiedSeats(reservations) {
    return reservations.reduce(
      (total, reservation) =>
        total + reservation.guestCount,
      0
    );
  }
}

export default new ReservationEligibilityService();