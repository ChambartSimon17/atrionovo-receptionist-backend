import assistantController from "./assistant.controller.js";
import assistantMassageController from "./assistant-massage.controller.js";

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

  // ====================================================
  // Massage businesses
  // ====================================================

  fastify.post(
    "/massage/caller-profile",
    assistantMassageController.getCallerProfile
  );

  fastify.post(
    "/massage/services",
    assistantMassageController.getServices
  );

  fastify.post(
    "/massage/check-availability",
    assistantMassageController.checkAvailability
  );

  fastify.post(
    "/massage/create-appointment",
    assistantMassageController.createAppointment
  );

  fastify.post(
    "/massage/reschedule-appointment",
    assistantMassageController.rescheduleAppointment
  );

  fastify.post(
    "/massage/cancel-appointment",
    assistantMassageController.cancelAppointment
  );
}
