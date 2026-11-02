import massageServiceRepository from "./massage-service.repository.js";
import ConflictError from "../../errors/ConflictError.js";
import NotFoundError from "../../errors/NotFoundError.js";
import { ErrorCodes } from "../../errors/error-codes.js";

// ======================================================
// Massage Service Service
// ======================================================
//
// Responsibility
// Business rules for the massage services a MASSAGE
// business offers (name, duration, price).
//
// Services are deactivated instead of deleted, so that
// existing appointments keep their service.
// ======================================================

class MassageServiceService {
  async list(businessId, options) {
    return massageServiceRepository.findAllForBusiness(
      businessId,
      options
    );
  }

  async create(businessId, data) {
    await this.#assertNameAvailable(
      businessId,
      data.name
    );

    return massageServiceRepository.create(
      businessId,
      data
    );
  }

  async update(businessId, serviceId, data) {
    const service = await this.#getService(
      businessId,
      serviceId
    );

    if (
      data.name !== undefined &&
      data.name !== service.name
    ) {
      await this.#assertNameAvailable(
        businessId,
        data.name
      );
    }

    return massageServiceRepository.update(
      serviceId,
      data
    );
  }

  /**
   * Deactivates a service. It disappears from the
   * booking flow but stays in the database.
   */
  async deactivate(businessId, serviceId) {
    await this.#getService(
      businessId,
      serviceId
    );

    await massageServiceRepository.update(
      serviceId,
      { isActive: false }
    );
  }

  async #getService(businessId, serviceId) {
    const service =
      await massageServiceRepository.findById(
        serviceId,
        businessId
      );

    if (!service) {
      throw new NotFoundError(
        "Massage service not found.",
        ErrorCodes.MASSAGE_SERVICE_NOT_FOUND
      );
    }

    return service;
  }

  async #assertNameAvailable(businessId, name) {
    const existing =
      await massageServiceRepository.findByName(
        businessId,
        name
      );

    if (existing) {
      throw new ConflictError(
        "A massage service with this name already exists.",
        ErrorCodes.MASSAGE_SERVICE_ALREADY_EXISTS
      );
    }
  }
}

export default new MassageServiceService();
