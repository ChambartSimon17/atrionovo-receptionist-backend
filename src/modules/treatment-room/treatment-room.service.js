import treatmentRoomRepository from "./treatment-room.repository.js";
import {
  assertMassageServicesBelongToBusiness,
} from "../massage-service/massage-service-ids.js";
import { validateWorkingHours } from "../therapist/working-hours.js";
import ConflictError from "../../errors/ConflictError.js";
import NotFoundError from "../../errors/NotFoundError.js";
import { ErrorCodes } from "../../errors/error-codes.js";

// ======================================================
// Treatment Room Service
// ======================================================
//
// Responsibility
// Business rules for the treatment rooms of a MASSAGE
// business and the massages that can take place in each.
//
// Rooms are deactivated instead of deleted, so that
// existing appointments keep their room.
// ======================================================

/**
 * Shape sent to the clients.
 */
function toDto(room) {
  return {
    id: room.id,
    name: room.name,
    isActive: room.isActive,
    serviceIds: room.services.map(
      (link) => link.massageServiceId
    ),
    // A location of the practice: bookable only within
    // its own hours, shown in the agenda.
    hasOwnHours: room.hasOwnHours,
    openingHours: room.openingHours.map((period) => ({
      dayOfWeek: period.dayOfWeek,
      startMinutes: period.opensAtMinutes,
      endMinutes: period.closesAtMinutes,
    })),
  };
}

class TreatmentRoomService {
  async list(businessId, options) {
    const rooms =
      await treatmentRoomRepository.findAllForBusiness(
        businessId,
        options
      );

    return rooms.map(toDto);
  }

  async create(businessId, data) {
    await this.#assertNameAvailable(
      businessId,
      data.name
    );

    const serviceIds =
      await assertMassageServicesBelongToBusiness(
        businessId,
        data.serviceIds
      );

    validateWorkingHours(data.openingHours);

    const room =
      await treatmentRoomRepository.create(
        businessId,
        {
          name: data.name,
          serviceIds,
          hasOwnHours: data.hasOwnHours,
          openingHours: data.openingHours,
        }
      );

    return toDto(room);
  }

  async update(businessId, roomId, data) {
    const room = await this.#getRoom(
      businessId,
      roomId
    );

    if (
      data.name !== undefined &&
      data.name !== room.name
    ) {
      await this.#assertNameAvailable(
        businessId,
        data.name
      );
    }

    const changes = { ...data };

    if (data.openingHours !== undefined) {
      validateWorkingHours(data.openingHours);
    }

    if (data.serviceIds !== undefined) {
      changes.serviceIds =
        await assertMassageServicesBelongToBusiness(
          businessId,
          data.serviceIds
        );
    }

    const updated =
      await treatmentRoomRepository.update(
        roomId,
        changes
      );

    return toDto(updated);
  }

  async deactivate(businessId, roomId) {
    await this.#getRoom(businessId, roomId);

    await treatmentRoomRepository.update(
      roomId,
      { isActive: false }
    );
  }

  async #getRoom(businessId, roomId) {
    const room =
      await treatmentRoomRepository.findById(
        roomId,
        businessId
      );

    if (!room) {
      throw new NotFoundError(
        "Treatment room not found.",
        ErrorCodes.TREATMENT_ROOM_NOT_FOUND
      );
    }

    return room;
  }

  async #assertNameAvailable(businessId, name) {
    const existing =
      await treatmentRoomRepository.findByName(
        businessId,
        name
      );

    if (existing) {
      throw new ConflictError(
        "A treatment room with this name already exists.",
        ErrorCodes.TREATMENT_ROOM_ALREADY_EXISTS
      );
    }
  }
}

export default new TreatmentRoomService();
