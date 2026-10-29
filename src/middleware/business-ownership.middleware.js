// ======================================================
// Business Ownership Middleware
// ======================================================
//
// Responsibility
// Ensure that the authenticated user can only access
// resources belonging to their own business.
//
// Authentication itself is handled by the authenticate
// middleware.
//
// Expected:
//
// request.user.businessId
// request.params.businessId
//
// On success:
// request continues.
//
// On failure:
// 403 Forbidden.
// ======================================================

export async function requireBusinessOwnership(
  request,
  reply
) {
  const userBusinessId =
    request.user?.businessId;

  const requestedBusinessId =
    request.params?.businessId;

  if (
    !userBusinessId ||
    !requestedBusinessId
  ) {
    return reply.status(403).send({
      success: false,
      error: {
        code:
          "RESTAURANT_ACCESS_DENIED",
        message:
          "You do not have access to this business.",
      },
    });
  }

  if (
    userBusinessId !==
    requestedBusinessId
  ) {
    return reply.status(403).send({
      success: false,
      error: {
        code:
          "RESTAURANT_ACCESS_DENIED",
        message:
          "You do not have access to this business.",
      },
    });
  }
}