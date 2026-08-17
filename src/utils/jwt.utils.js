import jwt from "jsonwebtoken";
import env from "../config/env.js";

// ======================================================
// JWT Utilities
// ======================================================
//
// Responsibility
// Create and verify authentication tokens.
//
// Access token:
// - Short-lived
// - Used for API requests
//
// Refresh token:
// - Long-lived
// - Used to obtain a new access token
// ======================================================

export function createAccessToken({
  userId,
  restaurantId,
  role,
}) {
  return jwt.sign(
    {
      userId,
      restaurantId,
      role,
    },
    env.jwtAccessSecret,
    {
      expiresIn: "15m",
    }
  );
}

export function createRefreshToken({
  userId,
}) {
  return jwt.sign(
    {
      userId,
    },
    env.jwtRefreshSecret,
    {
      expiresIn: "30d",
    }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(
    token,
    env.jwtAccessSecret
  );
}

export function verifyRefreshToken(token) {
  return jwt.verify(
    token,
    env.jwtRefreshSecret
  );
}