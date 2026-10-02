import { z } from "zod";

// ======================================================
// Register
// ======================================================

export const registerSchema = z.object({
  restaurantName: z
    .string()
    .trim()
    .min(1),

  slug: z
    .string()
    .trim()
    .min(1)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must contain only lowercase letters, numbers and hyphens."
    ),

  countryCode: z
    .string()
    .length(2),

  firstName: z
    .string()
    .trim()
    .min(1),

  lastName: z
    .string()
    .trim()
    .min(1),

  email: z
    .string()
    .trim()
    .email(),

  password: z
    .string()
    .min(
      8,
      "Password must contain at least 8 characters."
    ),
});

// ======================================================
// Login
// ======================================================

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email(),

  password: z
    .string()
    .min(1),
});


// ======================================================
// Refresh Token
// ======================================================
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});