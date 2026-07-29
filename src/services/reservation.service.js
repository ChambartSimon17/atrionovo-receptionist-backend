import reservationRepository from "../repositories/reservation.repository.js";
import NotFoundError from "../errors/NotFoundError.js";

class ReservationService {
  async checkAvailability({
    restaurantId,
    guestCount,
    startTime,
    endTime
  }) {
    const restaurant =
      await reservationRepository.findByRestaurantId(restaurantId);

    if (!restaurant) {
      throw new NotFoundError("Restaurant not found");
    }

    const reservations =
      await reservationRepository.findOverlappingReservations(
        restaurantId,
        startTime,
        endTime
      );

    const occupiedSeats = reservations.reduce(
      (total, reservation) => total + reservation.guestCount,
      0
    );

    const available =
      occupiedSeats + guestCount <= restaurant.maxCapacity;

    return available;
  }
}

export default new ReservationService();