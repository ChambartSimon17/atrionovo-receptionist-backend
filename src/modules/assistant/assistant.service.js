import customerService from "../customer/customer.service.js";
import reservationService from "../reservation/reservation.service.js";
import restaurantRepository from "../restaurant/restaurant.repository.js";
import NotFoundError from "../../errors/NotFoundError.js";
import { ErrorCodes } from "../../errors/error-codes.js";
import {
  localDateTimeStringToUTC,
  utcToLocalDateTimeString,
} from "../../utils/time.utils.js";

// ======================================================
// Assistant Service
// ======================================================
//
// Responsibility
// Provide AI-optimized endpoints.
//
// This service orchestrates existing domain services
// without implementing business logic itself.
// ======================================================

class AssistantService {
  /**
   * Retrieves the caller profile.
   */
  async getCallerProfile({
    restaurantId,
    phoneNumber,
  }) {
    const customer =
      await customerService.findByPhoneNumber({
        restaurantId,
        phoneNumber,
      });

    if (!customer) {
      return {
        customerFound: false,

        customer: null,

        upcomingReservations: [],
      };
    }

    const upcomingReservations =
      await reservationService.findUpcoming({
        restaurantId,
        phoneNumber,
      });

    return {
      customerFound: true,

      customer: {
        firstName: customer.firstName,
        lastName: customer.lastName,
        phoneNumber: customer.phoneNumber,
        email: customer.email,
        isVip: customer.isVip,
        notes: customer.notes,
      },

      upcomingReservations:
        upcomingReservations.map(
          (reservation) => ({
            id: reservation.id,
            startTime: reservation.startTime,
            endTime: reservation.endTime,
            guestCount: reservation.guestCount,
            status: reservation.status,
          })
        ),
    };
  }

  /**
   * Checks reservation availability.
   */
  async checkAvailability({
    restaurantId,
    guestCount,
    startTime,
  }) {
    const restaurant =
      await restaurantRepository.findById(
        restaurantId
      );

    if (!restaurant) {
      throw new NotFoundError(
        "Restaurant not found.",
        ErrorCodes.RESTAURANT_NOT_FOUND
      );
    }

    const startTimeUTC =
      localDateTimeStringToUTC(
        startTime,
        restaurant.timezone
      );

    const result =
      await reservationService.checkAvailability({
        restaurantId,
        guestCount,
        startTime: startTimeUTC,
      });

    return {
      ...result,

      requestedSlot: {
        startTime,
        endTime:
          utcToLocalDateTimeString(
            result.requestedSlot.endTime,
            restaurant.timezone
          ),
      },

      alternativeSlots:
        result.alternativeSlots.map(
          (slot) => ({
            startTime:
              utcToLocalDateTimeString(
                slot.startTime,
                restaurant.timezone
              ),

            endTime:
              utcToLocalDateTimeString(
                slot.endTime,
                restaurant.timezone
              ),
          })
        ),
    };
  }

  /**
   * Creates a new reservation.
   */
  async createReservation(
    reservationData
  ) {
    const restaurant =
      await restaurantRepository.findById(
        reservationData.restaurantId
      );

    if (!restaurant) {
      throw new NotFoundError(
        "Restaurant not found.",
        ErrorCodes.RESTAURANT_NOT_FOUND
      );
    }

    const startTimeUTC =
      localDateTimeStringToUTC(
        reservationData.startTime,
        restaurant.timezone
      );

    const reservation =
      await reservationService.createReservation(
        {
          ...reservationData,
          startTime: startTimeUTC,
        }
      );

    return {
      message:
        "Reservation created successfully.",

      customer: {
        firstName:
          reservation.firstName,

        lastName:
          reservation.lastName,

        phoneNumber:
          reservation.phoneNumber,

        email:
          reservation.email,
      },

      reservation: {
        id:
          reservation.id,

        startTime:
          utcToLocalDateTimeString(
            reservation.startTime,
            restaurant.timezone
          ),

        endTime:
          utcToLocalDateTimeString(
            reservation.endTime,
            restaurant.timezone
          ),

        guestCount:
          reservation.guestCount,

        status:
          reservation.status,
      },
    };
  }

  /**
   * Updates an existing reservation.
   */
  async updateReservation({
    restaurantId,
    reservationId,
    guestCount,
    startTime,
  }) {
    const restaurant =
      await restaurantRepository.findById(
        restaurantId
      );

    if (!restaurant) {
      throw new NotFoundError(
        "Restaurant not found.",
        ErrorCodes.RESTAURANT_NOT_FOUND
      );
    }

    const existingReservation =
      await reservationService.findById(
        reservationId
      );

    const startTimeUTC =
      localDateTimeStringToUTC(
        startTime,
        restaurant.timezone
      );

    const reservation =
      await reservationService.updateReservation(
        reservationId,
        {
          restaurantId,

          firstName:
            existingReservation.firstName,

          lastName:
            existingReservation.lastName,

          phoneNumber:
            existingReservation.phoneNumber,

          email:
            existingReservation.email,

          notes:
            existingReservation.notes,

          guestCount,

          startTime: startTimeUTC,
        }
      );

    return {
      message:
        "Reservation updated successfully.",

      reservation: {
        id: reservation.id,

        startTime:
          utcToLocalDateTimeString(
            reservation.startTime,
            restaurant.timezone
          ),

        endTime:
          utcToLocalDateTimeString(
            reservation.endTime,
            restaurant.timezone
          ),

        guestCount:
          reservation.guestCount,

        status:
          reservation.status,
      },
    };
  }

  /**
   * Cancels an existing reservation.
   */
  async cancelReservation({
    reservationId,
  }) {
    const reservation =
      await reservationService.cancelReservation(
        reservationId
      );

    return {
      message:
        "Reservation cancelled successfully.",

      reservation: {
        id: reservation.id,

        status:
          reservation.status,
      },
    };
  }
}

export default new AssistantService();