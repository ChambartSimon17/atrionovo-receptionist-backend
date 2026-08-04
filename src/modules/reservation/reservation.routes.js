import reservationController from "./reservation.controller.js";

export default async function reservationRoutes(fastify) {
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

  fastify.get(
    "/upcoming",
    reservationController.findUpcoming
  );
}