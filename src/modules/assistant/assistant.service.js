import customerService from "../customer/customer.service.js";
import reservationService from "../reservation/reservation.service.js";
import ValidationError from "../../errors/ValidationError.js";

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
    endTime,
  }) {
    try {
      await reservationService.checkAvailability({
        restaurantId,
        guestCount,
        startTime,
        endTime,
      });

      return {
        available: true,
        requestedSlot: {
          startTime,
          endTime,
        },
        alternativeSlots: [],
        reason: null,
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        return {
          available: false,
          requestedSlot: {
            startTime,
            endTime,
          },
          alternativeSlots: [],
          reason: error.code,
        };
      }

      throw error;
    }
  }

  async createReservation(
    reservationData
  ) {
    const reservation =
        await reservationService.createReservation(
        reservationData
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
            reservation.startTime,

        endTime:
            reservation.endTime,

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
    endTime,
  }) {
    const existingReservation =
      await reservationService.findById(
        reservationId
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

                startTime,
            }
        );

        return {
            message:
            "Reservation updated successfully.",

            reservation: {
            id: reservation.id,

            startTime:
                reservation.startTime,

            endTime:
                reservation.endTime,

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
                status: reservation.status,
            },
        };
    }
}

export default new AssistantService();