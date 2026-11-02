import { z } from "zod";

import { isValidCalendarDate } from "./local-time.js";

// ======================================================
// Massage Appointment Validation
// ======================================================

const calendarDate = z
  .string()
  .refine(isValidCalendarDate, {
    message: "Date must be a valid day, like 2026-11-02.",
  });

const notes = z.string().trim().max(1000);

export const availabilityQuerySchema = z.object({
  date: calendarDate,
  serviceId: z.string().min(1),
});

export const listAppointmentsQuerySchema = z.object({
  date: calendarDate,
});

export const createAppointmentSchema = z.object({
  massageServiceId: z.string().min(1),

  // UTC instant of one of the start times returned by the
  // availability endpoint.
  startTime: z.iso.datetime(),

  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phoneNumber: z.string().trim().min(1).max(40),
  email: z.email().optional(),

  notes: notes.optional(),
});

export const updateAppointmentSchema = z
  .object({
    status: z
      .enum(["COMPLETED", "CANCELLED", "NO_SHOW"])
      .optional(),
    notes: notes.nullable().optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message:
        "At least one appointment field must be provided.",
    }
  );
