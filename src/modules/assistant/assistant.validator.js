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
        "Start time must be a business-local datetime."
      ),
  });

// ======================================================
// Find Availability (several days)
// ======================================================

// Vapi sends "" for an argument the model left empty.
const emptyAsMissing = (schema) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === ""
        ? undefined
        : value,
    schema
  );

export const findAvailabilitySchema = z.object({
  guestCount: z.coerce.number().int().positive(),
  // First day to search; today when left out.
  fromDate: emptyAsMissing(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be like 2026-11-28.")
      .optional()
  ),
  // How many days to search (at most 21).
  days: emptyAsMissing(z.coerce.number().int().min(1).max(21).optional()),
  time: emptyAsMissing(
    z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Time must be like 19:30.")
      .optional()
  ),
  partOfDay: emptyAsMissing(
    z.enum(["ochtend", "middag", "avond"]).optional()
  ),
  weekday: emptyAsMissing(z.string().trim().max(20).optional()),
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
        "Start time must be a business-local datetime."
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
        "Start time must be a business-local datetime."
      ),
  });

// ======================================================
// Cancel Reservation
// ======================================================

export const cancelReservationSchema = z.object({
  reservationId: z.string().min(1),
});