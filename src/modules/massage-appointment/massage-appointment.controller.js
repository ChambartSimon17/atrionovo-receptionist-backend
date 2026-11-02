import massageAppointmentService from "./massage-appointment.service.js";
import massageAvailabilityService from "./massage-availability.service.js";
import {
  availabilityQuerySchema,
  createAppointmentSchema,
  listAppointmentsQuerySchema,
  updateAppointmentSchema,
} from "./massage-appointment.validator.js";

class MassageAppointmentController {
  /**
   * GET /businesses/:businessId/massage-availability
   *     ?date=2026-11-02&serviceId=...
   */
  async findAvailability(request, reply) {
    const query = availabilityQuerySchema.parse(
      request.query
    );

    const availability =
      await massageAvailabilityService.findSlots(
        request.params.businessId,
        query
      );

    return reply.send({
      success: true,
      data: availability,
    });
  }

  /**
   * GET /businesses/:businessId/appointments?date=2026-11-02
   */
  async list(request, reply) {
    const query = listAppointmentsQuerySchema.parse(
      request.query
    );

    const appointments =
      await massageAppointmentService.listForDay(
        request.params.businessId,
        query.date
      );

    return reply.send({
      success: true,
      data: appointments,
    });
  }

  /**
   * POST /businesses/:businessId/appointments
   */
  async create(request, reply) {
    const data = createAppointmentSchema.parse(
      request.body
    );

    const appointment =
      await massageAppointmentService.create(
        request.params.businessId,
        data
      );

    return reply.status(201).send({
      success: true,
      data: appointment,
    });
  }

  /**
   * PATCH /businesses/:businessId/appointments/:appointmentId
   */
  async update(request, reply) {
    const data = updateAppointmentSchema.parse(
      request.body
    );

    const appointment =
      await massageAppointmentService.update(
        request.params.businessId,
        request.params.appointmentId,
        data
      );

    return reply.send({
      success: true,
      data: appointment,
    });
  }
}

export default new MassageAppointmentController();
