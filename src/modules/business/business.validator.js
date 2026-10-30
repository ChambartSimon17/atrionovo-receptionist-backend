
import { z } from "zod";

export const updateBusinessSchema = z.object({
  name: z.string().min(1).optional(),

  maxCapacity: z.number().int().positive().optional(),

  timezone: z.string().min(1).optional(),

  language: z.string().min(1).optional(),

  voiceAgentEnabled: z.boolean().optional(),

  // MASSAGE businesses: minutes blocked after each
  // appointment for the therapist and the room.
  appointmentBufferMinutes: z
    .number()
    .int()
    .min(0)
    .max(120)
    .optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  {
    message: "At least one business field must be provided.",
  }
);
