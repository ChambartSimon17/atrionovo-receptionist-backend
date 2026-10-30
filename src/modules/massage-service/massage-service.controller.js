import massageServiceService from "./massage-service.service.js";
import {
  createMassageServiceSchema,
  updateMassageServiceSchema,
} from "./massage-service.validator.js";

class MassageServiceController {
  /**
   * GET /businesses/:businessId/massage-services
   *
   * ?includeInactive=true also returns deactivated services
   * (used by the owner's management screen).
   */
  async list(request, reply) {
    const services =
      await massageServiceService.list(
        request.params.businessId,
        {
          includeInactive:
            request.query?.includeInactive ===
            "true",
        }
      );

    return reply.send({
      success: true,
      data: services,
    });
  }

  /**
   * POST /businesses/:businessId/massage-services
   */
  async create(request, reply) {
    const data =
      createMassageServiceSchema.parse(
        request.body
      );

    const service =
      await massageServiceService.create(
        request.params.businessId,
        data
      );

    return reply.status(201).send({
      success: true,
      data: service,
    });
  }

  /**
   * PATCH /businesses/:businessId/massage-services/:serviceId
   */
  async update(request, reply) {
    const data =
      updateMassageServiceSchema.parse(
        request.body
      );

    const service =
      await massageServiceService.update(
        request.params.businessId,
        request.params.serviceId,
        data
      );

    return reply.send({
      success: true,
      data: service,
    });
  }

  /**
   * DELETE /businesses/:businessId/massage-services/:serviceId
   *
   * Deactivates the service.
   */
  async deactivate(request, reply) {
    await massageServiceService.deactivate(
      request.params.businessId,
      request.params.serviceId
    );

    return reply.status(204).send();
  }
}

export default new MassageServiceController();
