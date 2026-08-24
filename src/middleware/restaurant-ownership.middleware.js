// ======================================================
// Restaurant Ownership Middleware
// ======================================================
//
// Responsibility
// Ensure that the authenticated user can only access
// resources belonging to their own restaurant.
//
// Authentication itself is handled by the authenticate
// middleware.
//
// Expected:
//
// request.user.restaurantId
// request.params.restaurantId
//
// On success:
// request continues.
//
// On failure:
// 403 Forbidden.
// ======================================================

export async function requireRestaurantOwnership(
  request,
  reply
) {
  const userRestaurantId =
    request.user?.restaurantId;

  const requestedRestaurantId =
    request.params?.restaurantId;

  if (
    !userRestaurantId ||
    !requestedRestaurantId
  ) {
    return reply.status(403).send({
      success: false,
      error: {
        code:
          "RESTAURANT_ACCESS_DENIED",
        message:
          "You do not have access to this restaurant.",
      },
    });
  }

  if (
    userRestaurantId !==
    requestedRestaurantId
  ) {
    return reply.status(403).send({
      success: false,
      error: {
        code:
          "RESTAURANT_ACCESS_DENIED",
        message:
          "You do not have access to this restaurant.",
      },
    });
  }
}