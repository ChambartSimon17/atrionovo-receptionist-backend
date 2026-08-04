import reservationService from "./reservation.service.js";
import {
  createReservationSchema,
  checkAvailabilitySchema,
  findUpcomingReservationsSchema,
  rescheduleReservationSchema,
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
   * Reschedules an existing reservation.
   */
  async rescheduleReservation(request, reply) {
    const { id } = request.params;

    const reservation =
      rescheduleReservationSchema.parse(
        request.body
      );

    const updatedReservation =
      await reservationService.rescheduleReservation(
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

  /**
   * Cancels an existing reservation.
   */
  async cancelReservation(request, reply) {
    const { id } = request.params;

    const cancelledReservation =
      await reservationService.cancelReservation(
        id
      );

    return reply.send({
      success: true,
      data: cancelledReservation,
    });
  }

  /**
   * Finds upcoming reservations.
   */
  async findUpcoming(request, reply) {
    const search =
      findUpcomingReservationsSchema.parse(
        request.query
      );

    const reservations =
      await reservationService.findUpcoming(
        search
      );

    return reply.send({
      success: true,
      data: reservations,
    });
  }
}

export default new ReservationController();