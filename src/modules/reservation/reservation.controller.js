import reservationService from "./reservation.service.js";
import {
  createReservationSchema,
  checkAvailabilitySchema,
} from "./reservation.validator.js";

// ======================================================
// Reservation Controller
// ======================================================
//
// Responsibility
// Handle HTTP requests related to reservations.
//
// Responsibilities
// - Validate incoming requests
// - Delegate business logic to the service
// - Return HTTP responses
//
// This controller contains no business logic.
// ======================================================

class ReservationController {
  /**
   * Checks whether a reservation can be accepted.
   */
  async checkAvailability(request, reply) {
    const reservation =
      checkAvailabilitySchema.parse(request.body);

    const available =
      await reservationService.checkAvailability(
        reservation
      );

    return reply.send({
      available,
    });
  }

  /**
   * Creates a new reservation.
   */
  async createReservation(request, reply) {
    const reservation =
      createReservationSchema.parse(request.body);

    const createdReservation =
      await reservationService.createReservation(
        reservation
      );

    return reply.status(201).send({
      success: true,
      data: createdReservation,
    });
  }

  /**
   * Updates an existing reservation.
   */
  async updateReservation(request, reply) {
    const { id } = request.params;

    const reservation =
      createReservationSchema.parse(request.body);

    const updatedReservation =
      await reservationService.updateReservation(
        id,
        reservation
      );

    return reply.send({
      success: true,
      data: updatedReservation,
    });
  }

  /**
   * Deletes an existing reservation.
   */
  async deleteReservation(request, reply) {
    const { id } = request.params;

    await reservationService.deleteReservation(id);

    return reply.status(204).send();
  }
}

export default new ReservationController();