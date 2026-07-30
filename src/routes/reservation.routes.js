import reservationController from "../controllers/reservation.controller.js";

export default async function reservationRoutes(fastify) {
  fastify.post(
    "/check-availability",
    reservationController.checkAvailability
  );

  fastify.post(
    "/",
    reservationController.createReservation
  );
}