import { z } from "zod";

import { workingHourSchema } from "../therapist/therapist.validator.js";

const name = z.string().trim().min(1).max(100);

const serviceIds = z.array(z.string().min(1));

// A room with its own opening hours is a location of the
// practice. Same shape as the working hours of a
// therapist: [{ dayOfWeek, startMinutes, endMinutes }].
const hasOwnHours = z.boolean();
const openingHours = z.array(workingHourSchema);

export const createTreatmentRoomSchema = z.object({
  name,
  serviceIds: serviceIds.default([]),
  hasOwnHours: hasOwnHours.default(false),
  openingHours: openingHours.default([]),
});

// Fields that are left out stay unchanged. serviceIds, when
// sent, replaces the complete list.
export const updateTreatmentRoomSchema = z
  .object({
    name: name.optional(),
    isActive: z.boolean().optional(),
    serviceIds: serviceIds.optional(),
    hasOwnHours: hasOwnHours.optional(),
    // When sent, replaces the complete list.
    openingHours: openingHours.optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message:
        "At least one treatment room field must be provided.",
    }
  );
