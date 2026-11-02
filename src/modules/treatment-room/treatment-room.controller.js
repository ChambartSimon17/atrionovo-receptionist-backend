import treatmentRoomService from "./treatment-room.service.js";
import {
  createTreatmentRoomSchema,
  updateTreatmentRoomSchema,
} from "./treatment-room.validator.js";

class TreatmentRoomController {
  /**
   * GET /businesses/:businessId/treatment-rooms
   *
   * ?includeInactive=true also returns deactivated rooms.
   */
  async list(request, reply) {
    const rooms = await treatmentRoomService.list(
      request.params.businessId,
      {
        includeInactive:
          request.query?.includeInactive === "true",
      }
    );

    return reply.send({
      success: true,
      data: rooms,
    });
  }

  /**
   * POST /businesses/:businessId/treatment-rooms
   */
  async create(request, reply) {
    const data = createTreatmentRoomSchema.parse(
      request.body
    );

    const room = await treatmentRoomService.create(
      request.params.businessId,
      data
    );

    return reply.status(201).send({
      success: true,
      data: room,
    });
  }

  /**
   * PATCH /businesses/:businessId/treatment-rooms/:roomId
   */
  async update(request, reply) {
    const data = updateTreatmentRoomSchema.parse(
      request.body
    );

    const room = await treatmentRoomService.update(
      request.params.businessId,
      request.params.roomId,
      data
    );

    return reply.send({
      success: true,
      data: room,
    });
  }

  /**
   * DELETE /businesses/:businessId/treatment-rooms/:roomId
   *
   * Deactivates the room.
   */
  async deactivate(request, reply) {
    await treatmentRoomService.deactivate(
      request.params.businessId,
      request.params.roomId
    );

    return reply.status(204).send();
  }
}

export default new TreatmentRoomController();
