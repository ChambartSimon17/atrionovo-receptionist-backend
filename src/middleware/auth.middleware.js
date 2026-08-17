import {
  verifyAccessToken,
} from "../utils/jwt.utils.js";

// ======================================================
// Authentication Middleware
// ======================================================
//
// Responsibility
// Authenticate requests using a JWT access token.
//
// Expected header:
//
// Authorization: Bearer <accessToken>
//
// On success:
// request.user = {
//   userId,
//   restaurantId,
//   role,
// }
//
// On failure:
// 401 Unauthorized
// ======================================================

export async function authenticate(
  request,
  reply
) {
  const authorization =
    request.headers.authorization;

  if (!authorization) {
    return reply.status(401).send({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message:
          "Authentication required.",
      },
    });
  }

  const [scheme, token] =
    authorization.split(" ");

  if (
    scheme !== "Bearer" ||
    !token
  ) {
    return reply.status(401).send({
      success: false,
      error: {
        code: "INVALID_AUTHORIZATION_HEADER",
        message:
          "Invalid authorization header.",
      },
    });
  }

  try {
    const payload =
      verifyAccessToken(token);

    request.user = {
      userId: payload.userId,
      restaurantId:
        payload.restaurantId,
      role: payload.role,
    };
  } catch (error) {
    return reply.status(401).send({
      success: false,
      error: {
        code: "INVALID_ACCESS_TOKEN",
        message:
          "Invalid or expired access token.",
      },
    });
  }
}