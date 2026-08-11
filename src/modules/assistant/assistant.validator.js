import { z } from "zod";

// ======================================================
// Caller Profile
// ======================================================

export const callerProfileSchema = z.object({
  phoneNumber: z.string().min(1),
});

// ======================================================
// Check Availability
// ======================================================

export const checkAvailabilitySchema =
    z.object({
        guestCount: z.number().int().positive(),
        startTime: z.coerce.date(),
        endTime: z.coerce.date(),
    });

// ======================================================
// Create Reservation
// ======================================================

export const createReservationSchema =
  z.object({
    firstName: z.string().trim().min(1),

    lastName: z.string().trim().min(1),

    phoneNumber: z.string().min(1),

    email: z
      .string()
      .email()
      .optional()
      .or(z.literal("")),

    guestCount:
      z.number().int().positive(),

    startTime:
      z.coerce.date(),

    notes:
      z.string().optional(),
  });

// ======================================================
// Update Reservation
// ======================================================

export const updateReservationSchema =
  z.object({
    reservationId: z.string().min(1),

    guestCount:
      z.number().int().positive(),

    startTime:
      z.coerce.date(),
  });

// ======================================================
// Cancel Reservation
// ======================================================

export const cancelReservationSchema = z.object({
  reservationId: z.string().min(1),
});