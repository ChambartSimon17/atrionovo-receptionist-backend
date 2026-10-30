import massageAppointmentController from "./massage-appointment.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import {
  requireBusinessOwnership,
} from "../../middleware/business-ownership.middleware.js";
import {
  requireBusinessType,
} from "../../middleware/business-type.middleware.js";

// ======================================================
// Massage Appointment Routes
// ======================================================
//
// Only available to MASSAGE businesses, and only for
// their own business: authentication, ownership, type.
// ======================================================

const preHandler = [
  authenticate,
  requireBusinessOwnership,
  requireBusinessType("MASSAGE"),
];

export default async function massageAppointmentRoutes(
  fastify
) {
  fastify.get(
    "/:businessId/massage-availability",
    { preHandler },
    massageAppointmentController.findAvailability.bind(
      massageAppointmentController
    )
  );

  fastify.get(
    "/:businessId/appointments",
    { preHandler },
    massageAppointmentController.list.bind(
      massageAppointmentController
    )
  );

  fastify.post(
    "/:businessId/appointments",
    { preHandler },
    massageAppointmentController.create.bind(
      massageAppointmentController
    )
  );

  fastify.patch(
    "/:businessId/appointments/:appointmentId",
    { preHandler },
    massageAppointmentController.update.bind(
      massageAppointmentController
    )
  );
}
