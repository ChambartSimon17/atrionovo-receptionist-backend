import customerService from "../customer/customer.service.js";
import reservationService from "../reservation/reservation.service.js";

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
      customer: {
        firstName: customer.firstName,
        lastName: customer.lastName,
        isVip: customer.isVip,
        notes: customer.notes,
      },

      upcomingReservations:
        upcomingReservations.map(
          (reservation) => ({
            id: reservation.id,
            startTime: reservation.startTime,
            guestCount: reservation.guestCount,
            status: reservation.status,
          })
        ),
    };
  }
}

export default new AssistantService();