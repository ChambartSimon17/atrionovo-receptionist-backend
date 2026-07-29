import reservationService from "../services/reservation.service.js";

class ReservationController {
  async checkAvailability(request, reply) {
    const {
      restaurantId,
      guestCount,
      startTime,
      endTime,
    } = request.body;

    const result = await reservationService.checkAvailability({
      restaurantId,
      guestCount,
      startTime,
      endTime
    });

    return reply.send(result);
  }
}

export default new ReservationController();