import therapistService from "./therapist.service.js";
import {
  createTherapistSchema,
  updateTherapistSchema,
} from "./therapist.validator.js";

class TherapistController {
  /**
   * GET /businesses/:businessId/therapists
   *
   * ?includeInactive=true also returns deactivated
   * therapists (used by the owner's management screen).
   */
  async list(request, reply) {
    const therapists = await therapistService.list(
      request.params.businessId,
      {
        includeInactive:
          request.query?.includeInactive === "true",
      }
    );

    return reply.send({
      success: true,
      data: therapists,
    });
  }

  /**
   * POST /businesses/:businessId/therapists
   */
  async create(request, reply) {
    const data = createTherapistSchema.parse(
      request.body
    );

    const therapist = await therapistService.create(
      request.params.businessId,
      data
    );

    return reply.status(201).send({
      success: true,
      data: therapist,
    });
  }

  /**
   * PATCH /businesses/:businessId/therapists/:therapistId
   */
  async update(request, reply) {
    const data = updateTherapistSchema.parse(
      request.body
    );

    const therapist = await therapistService.update(
      request.params.businessId,
      request.params.therapistId,
      data
    );

    return reply.send({
      success: true,
      data: therapist,
    });
  }

  /**
   * DELETE /businesses/:businessId/therapists/:therapistId
   *
   * Deactivates the therapist.
   */
  async deactivate(request, reply) {
    await therapistService.deactivate(
      request.params.businessId,
      request.params.therapistId
    );

    return reply.status(204).send();
  }
}

export default new TherapistController();
