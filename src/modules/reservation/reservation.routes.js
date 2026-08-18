import reservationController from "./reservation.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";

export default async function reservationRoutes(fastify) {

  fastify.get(
    "/",
    {
      preHandler: authenticate,
    },
    reservationController.findUpcomingForRestaurant.bind(
      reservationController
    )
  );

  fastify.post(
    "/check-availability",
    reservationController.checkAvailability
  );

  fastify.post(
    "/",
    reservationController.createReservation
  );

  fastify.put(
    "/:id",
    reservationController.updateReservation
  );

  fastify.delete(
    "/:id",
    reservationController.deleteReservation
  );

  fastify.post(
    "/:id/cancel",
    reservationController.cancelReservation
  );

  fastify.post(
  "/:id/reschedule",
  reservationController.rescheduleReservation
);

  fastify.get(
    "/upcoming",
    reservationController.findUpcoming
  );
}