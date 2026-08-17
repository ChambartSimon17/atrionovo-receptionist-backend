import authService from "./auth.service.js";
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} from "./auth.validator.js";

// ======================================================
// Auth Controller
// ======================================================
//
// Responsibility
// Handle HTTP requests related to authentication.
//
// This controller:
// - Validates incoming requests
// - Delegates to the Auth Service
// - Returns HTTP responses
//
// No business logic belongs here.
// ======================================================

class AuthController {
  /**
   * Registers a new restaurant and owner account.
   */
  async register(request, reply) {
    const body =
      registerSchema.parse(
        request.body
      );

    const result =
      await authService.register(body);

    return reply.status(201).send({
      success: true,
      data: result,
    });
  }

  /**
   * Logs a user in.
   */
  async login(request, reply) {
    const body =
      loginSchema.parse(
        request.body
      );

    const result =
      await authService.login(body);

    return reply.send({
      success: true,
      data: result,
    });
  }

  /**
   * Refreshes the authentication tokens.
   */
  async refresh(request, reply) {
    const body =
      refreshTokenSchema.parse(
        request.body
      );

    const result =
      await authService.refresh(
        body.refreshToken
      );

    return reply.send({
      success: true,
      data: result,
    });
  }

  /**
   * Retrieves the authenticated user's profile.
   */
  async getMe(request, reply) {
    const result =
      await authService.getMe(
        request.user.userId
      );

    return reply.send({
      success: true,
      data: result,
    });
  }
}

export default new AuthController();