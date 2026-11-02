import therapistRepository from "./therapist.repository.js";
import { validateWorkingHours } from "./working-hours.js";
import {
  assertMassageServicesBelongToBusiness,
} from "../massage-service/massage-service-ids.js";
import ConflictError from "../../errors/ConflictError.js";
import NotFoundError from "../../errors/NotFoundError.js";
import { ErrorCodes } from "../../errors/error-codes.js";

// ======================================================
// Therapist Service
// ======================================================
//
// Responsibility
// Business rules for the therapists of a MASSAGE business:
// who they are, which massages they can perform and when
// they work.
//
// Therapists are deactivated instead of deleted, so that
// existing appointments keep their therapist.
// ======================================================

/**
 * Shape sent to the clients.
 */
function toDto(therapist) {
  return {
    id: therapist.id,
    name: therapist.name,
    isActive: therapist.isActive,
    serviceIds: therapist.services.map(
      (link) => link.massageServiceId
    ),
    workingHours: therapist.workingHours.map(
      (period) => ({
        dayOfWeek: period.dayOfWeek,
        startMinutes: period.startMinutes,
        endMinutes: period.endMinutes,
      })
    ),
  };
}

class TherapistService {
  async list(businessId, options) {
    const therapists =
      await therapistRepository.findAllForBusiness(
        businessId,
        options
      );

    return therapists.map(toDto);
  }

  async create(businessId, data) {
    validateWorkingHours(data.workingHours);

    await this.#assertNameAvailable(
      businessId,
      data.name
    );

    const serviceIds =
      await assertMassageServicesBelongToBusiness(
        businessId,
        data.serviceIds
      );

    const therapist =
      await therapistRepository.create(
        businessId,
        {
          name: data.name,
          serviceIds,
          workingHours: data.workingHours,
        }
      );

    return toDto(therapist);
  }

  async update(businessId, therapistId, data) {
    const therapist = await this.#getTherapist(
      businessId,
      therapistId
    );

    if (data.workingHours !== undefined) {
      validateWorkingHours(data.workingHours);
    }

    if (
      data.name !== undefined &&
      data.name !== therapist.name
    ) {
      await this.#assertNameAvailable(
        businessId,
        data.name
      );
    }

    const changes = { ...data };

    if (data.serviceIds !== undefined) {
      changes.serviceIds =
        await assertMassageServicesBelongToBusiness(
          businessId,
          data.serviceIds
        );
    }

    const updated =
      await therapistRepository.update(
        therapistId,
        changes
      );

    return toDto(updated);
  }

  async deactivate(businessId, therapistId) {
    await this.#getTherapist(
      businessId,
      therapistId
    );

    await therapistRepository.update(
      therapistId,
      { isActive: false }
    );
  }

  async #getTherapist(businessId, therapistId) {
    const therapist =
      await therapistRepository.findById(
        therapistId,
        businessId
      );

    if (!therapist) {
      throw new NotFoundError(
        "Therapist not found.",
        ErrorCodes.THERAPIST_NOT_FOUND
      );
    }

    return therapist;
  }

  async #assertNameAvailable(businessId, name) {
    const existing =
      await therapistRepository.findByName(
        businessId,
        name
      );

    if (existing) {
      throw new ConflictError(
        "A therapist with this name already exists.",
        ErrorCodes.THERAPIST_ALREADY_EXISTS
      );
    }
  }
}

export default new TherapistService();
