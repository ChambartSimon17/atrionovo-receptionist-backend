import businessService from "../business/business.service.js";
import {
  updateBusinessSchema,
} from "./business.validator.js";

class BusinessController {
  /**
   * Creates a new business.
   */
  async createBusiness(request, reply) {
    const business =
      await businessService.createBusiness(
        request.body
      );

    return reply.status(201).send({
      success: true,
      data: business,
    });
  }

  /**
   * Retrieves the business belonging
   * to the authenticated user.
   */
  async getMyBusiness(request, reply) {
    const business =
      await businessService.findForUser(
        request.user.businessId
      );

    return reply.send({
      success: true,
      data: business,
    });
  }

  /**
   * Updates the business belonging
   * to the authenticated user.
   */
  async updateMyBusiness(request, reply) {
    const businessData =
      updateBusinessSchema.parse(
        request.body
      );

    const business =
      await businessService.updateForUser(
        request.user.businessId,
        businessData
      );

    return reply.send({
      success: true,
      data: business,
    });
  }
}

export default new BusinessController();