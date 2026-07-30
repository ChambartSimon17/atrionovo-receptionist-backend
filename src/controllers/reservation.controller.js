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

  async createReservation(request, reply) {
    const reservation = await reservationService.createReservation(
        request.body
    );

    return reply.status(201).send({
        success: true,
        data: reservation,
    });
  }
}

export default new ReservationController();