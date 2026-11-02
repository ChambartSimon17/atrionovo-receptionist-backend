import { z } from "zod";

// ======================================================
// Public Booking Validators
// ======================================================
//
// These validators are used by the website booking widget.
//
// Important:
// businessId is intentionally NOT accepted from the
// public client.
//
// The business is identified by its public slug in the
// URL and the backend resolves the actual business ID.
// ======================================================

export const publicAvailabilitySchema = z.object({
  guestCount: z
    .number()
    .int()
    .positive(),

  date: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "Date must be in YYYY-MM-DD format."
    ),

  time: z
    .string()
    .regex(
      /^\d{2}:\d{2}$/,
      "Time must be in HH:mm format."
    ),
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

  date: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "Date must be in YYYY-MM-DD format."
    ),

  time: z
    .string()
    .regex(
      /^\d{2}:\d{2}$/,
      "Time must be in HH:mm format."
    ),

  notes: z
    .string()
    .optional(),
});

// ======================================================
// Massage businesses
// ======================================================
//
// The same rules as the dashboard, without the business id
// (it comes from the slug in the URL).
// ======================================================

export {
  availabilityQuerySchema as publicMassageAvailabilitySchema,
  createAppointmentSchema as publicMassageAppointmentSchema,
} from "../massage-appointment/massage-appointment.validator.js";
