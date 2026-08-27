import reservationService from "./reservation.service.js";
import {
  createReservationSchema,
  checkAvailabilitySchema,
  findUpcomingReservationsSchema,
  rescheduleReservationSchema,
  updateReservationSchema,
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
    const body =
      checkAvailabilitySchema.parse(
        request.body
      );

    const result =
      await reservationService.checkAvailability({
        restaurantId:
          request.headers["x-restaurant-id"],

        ...body,
      });

    return reply.send({
      success: true,
      data: result,
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

  /**
   * Finds upcoming reservations for
   * the authenticated restaurant.
   */
  async findUpcomingForRestaurant(
    request,
    reply
  ) {
    const reservations =
      await reservationService.findUpcomingForRestaurant(
        request.user.restaurantId
      );

    return reply.send({
      success: true,
      data: reservations,
    });
  }

  /**
   * Finds all confirmed reservations for the
   * authenticated restaurant on a specific day.
   */
  async findForRestaurantByDay(
    request,
    reply
  ) {
    const { date } = request.query;

    const reservations =
      await reservationService.findForRestaurantByDay(
        request.user.restaurantId,
        date
      );

    return reply.send({
      success: true,
      data: reservations,
    });
  }

  /**
   * Finds a reservation by ID for the authenticated restaurant.
   */
  async findByIdForRestaurant(request, reply) {
    const { id } = request.params;

    const reservation =
      await reservationService.findByIdForRestaurant(
        id,
        request.user.restaurantId
      );

    return reply.send({
      success: true,
      data: reservation,
    });
  }

  /**
   * Updates an existing reservation
   * for the authenticated restaurant.
   */
  async updateReservationForRestaurant(request, reply) {
    const { id } = request.params;

    const reservation =
      updateReservationSchema.parse(
        request.body
      );

    const updatedReservation =
      await reservationService.updateReservationForRestaurant(
        id,
        request.user.restaurantId,
        reservation
      );

    return reply.send({
      success: true,
      data: updatedReservation,
    });
  }

}

export default new ReservationController();