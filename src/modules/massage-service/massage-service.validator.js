import { z } from "zod";

// ======================================================
// Massage Service Validation
// ======================================================
//
// Prices are sent and stored in cents (5500 = 55.00).
// ======================================================

const name = z.string().trim().min(1).max(100);

const description = z
  .string()
  .trim()
  .max(500)
  .nullable();

const durationMinutes = z
  .number()
  .int()
  .min(5)
  .max(480);

const priceCents = z
  .number()
  .int()
  .min(0)
  .max(1_000_000);

export const createMassageServiceSchema = z.object({
  name,
  description: description.optional(),
  durationMinutes,
  priceCents,
});

export const updateMassageServiceSchema = z
  .object({
    name: name.optional(),
    description: description.optional(),
    durationMinutes: durationMinutes.optional(),
    priceCents: priceCents.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    {
      message:
        "At least one service field must be provided.",
    }
  );
