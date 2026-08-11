import assistantController from "./assistant.controller.js";

export default async function assistantRoutes(fastify) {
  fastify.post(
    "/caller-profile",
    assistantController.getCallerProfile
  );

  fastify.post(
    "/check-availability",
    assistantController.checkAvailability
  );

  fastify.post(
    "/create-reservation",
    assistantController.createReservation
  );

  fastify.post(
    "/update-reservation",
    assistantController.updateReservation
  );

  fastify.post(
    "/cancel-reservation",
    assistantController.cancelReservation
  );
}