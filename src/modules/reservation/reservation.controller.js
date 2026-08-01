import reservationService from "./reservation.service.js";
import { createReservationSchema, checkAvailabilitySchema } from "./reservation.validator.js";

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
}

export default new ReservationController();