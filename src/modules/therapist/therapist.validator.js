import { z } from "zod";

// ======================================================
// Therapist Validation
// ======================================================
//
// Working hours use minutes after midnight, like the
// business opening hours (09:00 -> 540, 17:30 -> 1050).
// ======================================================

const name = z.string().trim().min(1).max(100);

const serviceIds = z.array(z.string().min(1));

export const workingHourSchema = z.object({
  dayOfWeek: z.enum([
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
  ]),

  startMinutes: z.number().int().min(0).max(1439),

  endMinutes: z.number().int().min(1).max(1440),
});

const workingHours = z.array(workingHourSchema);

export const createTherapistSchema = z.object({
  name,
  serviceIds: serviceIds.default([]),
  workingHours: workingHours.default([]),
});

// Fields that are left out stay unchanged. serviceIds and
// workingHours, when sent, replace the complete list.
export const updateTherapistSchema = z
  .object({
    name: name.optional(),
    isActive: z.boolean().optional(),
    serviceIds: serviceIds.optional(),
    workingHours: workingHours.optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message:
        "At least one therapist field must be provided.",
    }
  );
