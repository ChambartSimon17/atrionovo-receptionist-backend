import assistantService from "./assistant.service.js";
import {
  callerProfileSchema,
} from "./assistant.validator.js";

// ======================================================
// Assistant Controller
// ======================================================
//
// Responsibility
// Handle AI assistant requests.
//
// This controller validates requests and delegates
// orchestration to the Assistant Service.
// ======================================================

class AssistantController {
  /**
   * Retrieves the caller profile.
   */
  async getCallerProfile(request, reply) {
    const search =
      callerProfileSchema.parse(
        request.query
      );

    const profile =
      await assistantService.getCallerProfile(
        search
      );

    return reply.send({
      success: true,
      data: profile,
    });
  }
}

export default new AssistantController();