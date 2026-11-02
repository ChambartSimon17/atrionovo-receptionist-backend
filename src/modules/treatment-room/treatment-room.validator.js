import { z } from "zod";

const name = z.string().trim().min(1).max(100);

const serviceIds = z.array(z.string().min(1));

export const createTreatmentRoomSchema = z.object({
  name,
  serviceIds: serviceIds.default([]),
});

// Fields that are left out stay unchanged. serviceIds, when
// sent, replaces the complete list.
export const updateTreatmentRoomSchema = z
  .object({
    name: name.optional(),
    isActive: z.boolean().optional(),
    serviceIds: serviceIds.optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message:
        "At least one treatment room field must be provided.",
    }
  );
