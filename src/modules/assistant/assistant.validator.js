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
    startTime: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,
        "Start time must be a restaurant-local datetime."
      ),
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

    guestCount: z.number().int().positive(),

    startTime: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,
        "Start time must be a restaurant-local datetime."
      ),

    notes: z.string().optional(),
  });

// ======================================================
// Update Reservation
// ======================================================

export const updateReservationSchema =
  z.object({
    reservationId: z.string().min(1),

    guestCount: z
      .number()
      .int()
      .positive(),

    startTime: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,
        "Start time must be a restaurant-local datetime."
      ),
  });

// ======================================================
// Cancel Reservation
// ======================================================

export const cancelReservationSchema = z.object({
  reservationId: z.string().min(1),
});