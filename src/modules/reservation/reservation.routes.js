import reservationController from "./reservation.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";

export default async function reservationRoutes(fastify) {

  // ====================================================
  // Static routes FIRST
  // ====================================================

  fastify.get(
    "/upcoming",
    reservationController.findUpcoming
  );

  fastify.get(
    "/day",
    {
      preHandler: authenticate,
    },
    reservationController.findForBusinessByDay.bind(
      reservationController
    )
  );

  fastify.get(
    "/month",
    {
      preHandler: authenticate,
    },
    reservationController.findReservationCountsForMonth.bind(
      reservationController
    )
  );

  // ====================================================
  // Dashboard
  // ====================================================

  fastify.get(
    "/",
    {
      preHandler: authenticate,
    },
    reservationController.findUpcomingForBusiness.bind(
      reservationController
    )
  );

  // ====================================================
  // Single reservation LAST
  // ====================================================

  fastify.get(
    "/:id",
    {
      preHandler: authenticate,
    },
    reservationController.findByIdForBusiness.bind(
      reservationController
    )
  );

  // ====================================================
  // Other reservation actions
  // ====================================================

  fastify.post(
    "/check-availability",
    reservationController.checkAvailability
  );

  fastify.post(
    "/check-availability/business",
    {
      preHandler: authenticate,
    },
    reservationController.checkAvailabilityForBusiness.bind(
      reservationController
    )
  );

  fastify.post(
    "/",
    reservationController.createReservation
  );

  fastify.put(
    "/:id",
    reservationController.updateReservation
  );

  fastify.put(
    "/:id/edit",
    {
      preHandler: authenticate,
    },
    reservationController.updateReservationForBusiness.bind(
      reservationController
    )
  );

  fastify.delete(
    "/:id",
    reservationController.deleteReservation
  );

  fastify.post(
    "/:id/cancel",
    reservationController.cancelReservation
  );

  fastify.patch(
    "/:businessId/:reservationId/seat",
    reservationController.seatReservation.bind(
      reservationController
    )
  );

  fastify.patch(
    "/:businessId/:reservationId/complete",
    reservationController.completeReservation.bind(
      reservationController
    )
  );

  fastify.post(
    "/:id/reschedule",
    reservationController.rescheduleReservation
  );

}