import restaurantRepository from "../restaurant/restaurant.repository.js";
import reservationEligibilityService from "../reservation-eligibility/reservation-eligibility.service.js";
import reservationRepository from "./reservation.repository.js";
import { addMinutes } from "../../utils/time.utils.js";

// ======================================================
// Reservation Service
// ======================================================
//
// Responsibility
// Manage restaurant reservations.
//
// This service orchestrates reservation-related business
// operations and delegates eligibility checks to the
// Reservation Eligibility Service.
// ======================================================

class ReservationService {
  /**
   * Checks whether a reservation can be accepted.
   */
  async checkAvailability({
    restaurantId,
    guestCount,
    startTime,
    endTime,
  }) {
    return reservationEligibilityService.checkEligibility({
      restaurantId,
      guestCount,
      startTime,
      endTime,
    });
  }

  /**
   * Creates a new reservation.
   *
   * The reservation end time is automatically calculated
   * using the restaurant's default reservation duration.
   */
  async createReservation(reservationData) {
    const restaurant = await restaurantRepository.findById(
      reservationData.restaurantId
    );

    const endTime = addMinutes(
      new Date(reservationData.startTime),
      restaurant.defaultReservationDurationMinutes
    );

    const completeReservation = {
      ...reservationData,
      endTime,
    };

    await reservationEligibilityService.checkEligibility({
      restaurantId: completeReservation.restaurantId,
      guestCount: completeReservation.guestCount,
      startTime: completeReservation.startTime,
      endTime: completeReservation.endTime,
    });

    return reservationRepository.create(
      completeReservation
    );
  }
}

export default new ReservationService();