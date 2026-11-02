import businessRepository from "../modules/business/business.repository.js";
import { ErrorCodes } from "../errors/error-codes.js";

// ======================================================
// Business Type Middleware
// ======================================================
//
// Responsibility
// Ensure that a route is only used by businesses of the
// right type (for example massage services can only be
// managed by a MASSAGE business).
//
// Must run after authenticate, because it reads
// request.user.businessId.
//
// Usage:
//
// preHandler: [
//   authenticate,
//   requireBusinessType("MASSAGE"),
// ]
//
// On failure:
// 403 Forbidden.
// ======================================================

export function requireBusinessType(...allowedTypes) {
  return async function checkBusinessType(
    request,
    reply
  ) {
    const business =
      await businessRepository.findById(
        request.user?.businessId
      );

    if (
      !business ||
      !allowedTypes.includes(
        business.businessType
      )
    ) {
      return reply.status(403).send({
        success: false,
        message:
          "This feature is not available for your type of business.",
        code: ErrorCodes.WRONG_BUSINESS_TYPE,
        errors: [],
      });
    }
  };
}
