import reservationEligibilityService from "../reservation-eligibility/reservation-eligibility.service.js";
import reservationRepository from "./reservation.repository.js";

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
   */
  async createReservation(reservationData) {
    await reservationEligibilityService.checkEligibility({
      restaurantId: reservationData.restaurantId,
      guestCount: reservationData.guestCount,
      startTime: reservationData.startTime,
      endTime: reservationData.endTime,
    });

    return reservationRepository.create(reservationData);
  }
}

export default new ReservationService();