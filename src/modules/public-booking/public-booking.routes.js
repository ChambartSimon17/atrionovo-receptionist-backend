import publicBookingController
  from "./public-booking.controller.js";

// ======================================================
// Public Booking Routes
// ======================================================
//
// These routes are intentionally NOT protected by
// authenticate middleware.
//
// They are consumed by business websites.
// ======================================================

export default async function publicBookingRoutes(
  fastify
) {

  // ----------------------------------------------------
  // Business information
  // ----------------------------------------------------

  fastify.get(
    "/:slug",
    publicBookingController.getBusiness.bind(
      publicBookingController
    )
  );

  // ----------------------------------------------------
  // Availability
  // ----------------------------------------------------

  fastify.post(
    "/:slug/availability",
    publicBookingController.checkAvailability.bind(
      publicBookingController
    )
  );

  // ----------------------------------------------------
  // Create reservation
  // ----------------------------------------------------

  fastify.post(
    "/:slug/reservation",
    publicBookingController.createReservation.bind(
      publicBookingController
    )
  );

  fastify.post(
    "/:slug/reservations",
    publicBookingController.createReservation.bind(
      publicBookingController
    )
  );

  // ----------------------------------------------------
  // Massage businesses
  // ----------------------------------------------------

  fastify.get(
    "/:slug/massage-services",
    publicBookingController.getMassageServices.bind(
      publicBookingController
    )
  );

  fastify.get(
    "/:slug/massage-availability",
    publicBookingController.getMassageAvailability.bind(
      publicBookingController
    )
  );

  fastify.post(
    "/:slug/massage-appointments",
    publicBookingController.createMassageAppointment.bind(
      publicBookingController
    )
  );
}