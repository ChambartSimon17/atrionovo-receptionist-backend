import assistantMassageService from "./assistant-massage.service.js";
import {
  massageCallerProfileSchema,
  massageCheckAvailabilitySchema,
  massageCreateAppointmentSchema,
  massageRescheduleAppointmentSchema,
  massageCancelAppointmentSchema,
} from "./assistant-massage.validator.js";

// ======================================================
// Assistant Massage Controller
// ======================================================
//
// Responsibility
// Validate Vapi requests for MASSAGE businesses and
// delegate to the Assistant Massage Service.
//
// The business id arrives in the x-business-id header
// (the old x-restaurant-id header is mapped to it by the
// legacy compatibility middleware).
// ======================================================

const businessIdOf = (request) =>
  request.headers["x-business-id"];

class AssistantMassageController {
  async getCallerProfile(request, reply) {
    const body = massageCallerProfileSchema.parse(
      request.body
    );

    const data = await assistantMassageService.getCallerProfile({
      businessId: businessIdOf(request),
      ...body,
    });

    return reply.send({ success: true, data });
  }

  async getServices(request, reply) {
    const data = await assistantMassageService.getServices({
      businessId: businessIdOf(request),
    });

    return reply.send({ success: true, data });
  }

  async checkAvailability(request, reply) {
    const body = massageCheckAvailabilitySchema.parse(
      request.body
    );

    const data = await assistantMassageService.checkAvailability({
      businessId: businessIdOf(request),
      ...body,
    });

    return reply.send({ success: true, data });
  }

  async createAppointment(request, reply) {
    const body = massageCreateAppointmentSchema.parse(
      request.body
    );

    const data = await assistantMassageService.createAppointment({
      businessId: businessIdOf(request),
      ...body,
    });

    return reply.send({ success: true, data });
  }

  async rescheduleAppointment(request, reply) {
    const body = massageRescheduleAppointmentSchema.parse(
      request.body
    );

    const data =
      await assistantMassageService.rescheduleAppointment({
        businessId: businessIdOf(request),
        ...body,
      });

    return reply.send({ success: true, data });
  }

  async cancelAppointment(request, reply) {
    const body = massageCancelAppointmentSchema.parse(
      request.body
    );

    const data = await assistantMassageService.cancelAppointment({
      businessId: businessIdOf(request),
      ...body,
    });

    return reply.send({ success: true, data });
  }
}

export default new AssistantMassageController();
