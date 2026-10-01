import publicBookingController
  from "./public-booking.controller.js";

// ======================================================
// Public Booking Routes
// ======================================================
//
// These routes are intentionally NOT protected by
// authenticate middleware.
//
// They are consumed by restaurant websites.
// ======================================================

export default async function publicBookingRoutes(
  fastify
) {

  // ----------------------------------------------------
  // Restaurant information
  // ----------------------------------------------------

  fastify.get(
    "/:slug",
    publicBookingController.getRestaurant.bind(
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
}