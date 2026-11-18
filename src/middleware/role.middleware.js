// ======================================================
// Role Middleware
// ======================================================
//
// Responsibility
// Restrict a route to some user roles (after authenticate).
//
// Example
// preHandler: [authenticate, requireRole("OWNER", "MANAGER")]
// ======================================================

export function requireRole(...roles) {
  return async function checkRole(request, reply) {
    if (!roles.includes(request.user?.role)) {
      return reply.status(403).send({
        success: false,
        error: {
          code: "ROLE_NOT_ALLOWED",
          message: "Only the owner can change this.",
        },
      });
    }
  };
}
