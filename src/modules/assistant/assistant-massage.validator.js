import { z } from "zod";

import { isValidCalendarDate } from "../massage-appointment/local-time.js";

// ======================================================
// Assistant Massage Validation
// ======================================================
//
// Business-local times use the same format as the
// restaurant assistant: "2026-11-02T14:00:00", without a
// time zone.
// ======================================================

const calendarDate = z
  .string()
  .refine(isValidCalendarDate, {
    message: "Date must be a valid day, like 2026-11-02.",
  });

const localDateTime = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,
    "Start time must be a business-local datetime."
  );

export const massageCallerProfileSchema = z.object({
  phoneNumber: z.string().min(1),
});

export const massageCheckAvailabilitySchema = z.object({
  massageServiceId: z.string().min(1),
  date: calendarDate,
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Time must be like 14:00.")
    .optional(),
});

export const massageCreateAppointmentSchema = z.object({
  massageServiceId: z.string().min(1),
  startTime: localDateTime,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phoneNumber: z.string().trim().min(1).max(40),
  notes: z.string().trim().max(1000).optional(),
});

export const massageRescheduleAppointmentSchema = z.object({
  appointmentId: z.string().min(1),
  phoneNumber: z.string().trim().min(1).max(40),
  startTime: localDateTime,
});

export const massageCancelAppointmentSchema = z.object({
  appointmentId: z.string().min(1),
  phoneNumber: z.string().trim().min(1).max(40),
});
