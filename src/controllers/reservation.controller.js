import reservationService from "../services/reservation.service.js";

class ReservationController {
  async checkAvailability(request, reply) {
    const available = await reservationService.checkAvailability(
      request.body
    );

    return reply.send({
      available,
    });
  }
}

export default new ReservationController();