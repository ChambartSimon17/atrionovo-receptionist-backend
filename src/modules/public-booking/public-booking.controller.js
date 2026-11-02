import publicBookingService
  from "./public-booking.service.js";

import publicMassageBookingService
  from "./public-massage-booking.service.js";

import {
  publicAvailabilitySchema,
  publicMassageAppointmentSchema,
  publicMassageAvailabilitySchema,
  publicReservationSchema,
} from "./public-booking.validator.js";

// ======================================================
// Public Booking Controller
// ======================================================
//
// HTTP layer for website booking.
//
// No business logic belongs here.
// ======================================================

class PublicBookingController {

  /**
   * Returns public business configuration
   * required by the booking widget.
   */
  async getBusiness(request, reply) {
    const { slug } =
      request.params;

    const business =
      await publicBookingService.getBusiness(
        slug
      );

    return reply.send({
      success: true,
      data: business,
    });
  }

  /**
   * Checks availability for the requested
   * date/time and number of guests.
   */
  async checkAvailability(
    request,
    reply
  ) {
    const { slug } =
      request.params;

    const booking =
      publicAvailabilitySchema.parse(
        request.body
      );

    const result =
      await publicBookingService.checkAvailability(
        slug,
        booking
      );

    return reply.send({
      success: true,
      data: result,
    });
  }

  /**
   * Creates a reservation from the business website.
   */
  async createReservation(
    request,
    reply
  ) {
    const { slug } =
      request.params;

    const reservation =
      publicReservationSchema.parse(
        request.body
      );

    const createdReservation =
      await publicBookingService.createReservation(
        slug,
        reservation
      );

    return reply.status(201).send({
      success: true,
      data: createdReservation,
    });
  }

  // ----------------------------------------------------
  // Massage businesses
  // ----------------------------------------------------

  /**
   * Active massages with prices.
   */
  async getMassageServices(request, reply) {
    const services =
      await publicMassageBookingService.getServices(
        request.params.slug
      );

    return reply.send({
      success: true,
      data: services,
    });
  }

  /**
   * Free times of a day for one massage.
   * ?date=2026-11-02&serviceId=...
   */
  async getMassageAvailability(request, reply) {
    const query =
      publicMassageAvailabilitySchema.parse(
        request.query
      );

    const availability =
      await publicMassageBookingService.getAvailability(
        request.params.slug,
        query
      );

    return reply.send({
      success: true,
      data: availability,
    });
  }

  /**
   * Books a massage.
   */
  async createMassageAppointment(request, reply) {
    const data =
      publicMassageAppointmentSchema.parse(
        request.body
      );

    const appointment =
      await publicMassageBookingService.createAppointment(
        request.params.slug,
        data
      );

    return reply.status(201).send({
      success: true,
      data: appointment,
    });
  }
}

export default new PublicBookingController();