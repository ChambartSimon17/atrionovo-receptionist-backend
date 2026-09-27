import { z } from "zod";

// ======================================================
// Public Booking Validators
// ======================================================
//
// These validators are used by the website booking widget.
//
// Important:
// restaurantId is intentionally NOT accepted from the
// public client.
//
// The restaurant is identified by its public slug in the
// URL and the backend resolves the actual restaurant ID.
// ======================================================

export const publicAvailabilitySchema = z.object({
  guestCount: z
    .number()
    .int()
    .positive(),

  startTime: z
    .iso
    .datetime(),
});

export const publicReservationSchema = z.object({
  firstName: z
    .string()
    .min(1),

  lastName: z
    .string()
    .min(1),

  phoneNumber: z
    .string()
    .min(1),

  email: z
    .email()
    .optional(),

  guestCount: z
    .number()
    .int()
    .positive(),

  startTime: z
    .iso
    .datetime(),

  notes: z
    .string()
    .optional(),
});