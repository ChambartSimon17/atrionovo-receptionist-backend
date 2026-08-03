import restaurantRepository from "../restaurant/restaurant.repository.js";
import reservationEligibilityService from "../reservation-eligibility/reservation-eligibility.service.js";
import reservationRepository from "./reservation.repository.js";
import NotFoundError from "../../errors/NotFoundError.js";
import ValidationError from "../../errors/ValidationError.js";
import { addMinutes } from "../../utils/time.utils.js";
import { normalizePhoneNumber } from "../../utils/phone.utils.js";
import { normalizeEmail } from "../../utils/email.utils.js";

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
      phoneNumber: normalizePhoneNumber(
        reservationData.phoneNumber
      ),
      email: normalizeEmail(
        reservationData.email
      ),
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

  /**
   * Updates an existing reservation.
   *
   * The reservation end time is automatically recalculated
   * using the restaurant's default reservation duration.
   */
  async updateReservation(id, reservationData) {
    const existingReservation =
      await reservationRepository.findById(id);

    if (!existingReservation) {
      throw new NotFoundError(
        "Reservation not found."
      );
    }

    const restaurant = await restaurantRepository.findById(
      reservationData.restaurantId
    );

    const endTime = addMinutes(
      new Date(reservationData.startTime),
      restaurant.defaultReservationDurationMinutes
    );

    const completeReservation = {
      ...reservationData,
      phoneNumber: normalizePhoneNumber(
        reservationData.phoneNumber
      ),
      email: normalizeEmail(
        reservationData.email
      ),
      endTime,
    };

    await reservationEligibilityService.checkEligibility({
      restaurantId: completeReservation.restaurantId,
      guestCount: completeReservation.guestCount,
      startTime: completeReservation.startTime,
      endTime: completeReservation.endTime,
      ignoreReservationId: id,
    });

    return reservationRepository.update(
      id,
      completeReservation
    );
  }

  /**
   * Deletes an existing reservation.
   */
  async deleteReservation(id) {
    const reservation =
      await reservationRepository.findById(id);

    if (!reservation) {
      throw new NotFoundError(
        "Reservation not found."
      );
    }

    await reservationRepository.delete(id);
  }

  /**
   * Finds upcoming reservations.
   */
  async findUpcoming(search) {
    const restaurant =
      await restaurantRepository.findById(
        search.restaurantId
      );

    if (!restaurant) {
      throw new NotFoundError(
        "Restaurant not found."
      );
    }

    if (
      !search.phoneNumber &&
      !search.email &&
      !search.lastName
    ) {
      throw new ValidationError(
        "Provide at least one search parameter."
      );
    }

    const searchCriteria = {
      ...search,
    };

    if (search.phoneNumber) {
      searchCriteria.phoneNumber =
        normalizePhoneNumber(
          search.phoneNumber
        );
    }

    if (search.email) {
      searchCriteria.email =
        normalizeEmail(
          search.email
        );
    }

    return reservationRepository.findUpcoming(
      searchCriteria
    );
  }
}

export default new ReservationService();