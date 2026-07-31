import reservationRepository from "./reservation.repository.js";
import NotFoundError from "../../errors/NotFoundError.js";
import ConflictError from "../../errors/ConflictError.js";

class ReservationService {
  async checkAvailability({
    restaurantId,
    guestCount,
    startTime,
    endTime
  }) {
    const restaurant =
      await reservationRepository.findRestaurantById(restaurantId);

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

  async createReservation({
    restaurantId,
    firstName,
    lastName,
    phoneNumber,
    email,
    guestCount,
    startTime,
    endTime,
    notes,
  }) {
    const available = await this.checkAvailability({
        restaurantId,
        guestCount,
        startTime,
        endTime,
    });

    if (!available) {
        throw new ConflictError(
        "Not enough capacity for this reservation."
        );
    }

    return reservationRepository.create({
        restaurantId,
        firstName,
        lastName,
        phoneNumber,
        email,
        guestCount,
        startTime,
        endTime,
        notes,
        status: "CONFIRMED",
    });
  }
}

export default new ReservationService();