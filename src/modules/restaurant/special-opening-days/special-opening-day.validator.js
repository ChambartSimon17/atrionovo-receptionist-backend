import { z } from "zod";

// ======================================================
// Special Opening Day Validator
// ======================================================
//
// Responsibility
// Validate incoming requests for special
// opening days.
//
// This file validates request structure only.
// Business rules belong in the service.
// ======================================================

export const openingPeriodSchema = z.object({
  opensAtMinutes: z
    .number()
    .int()
    .min(0)
    .max(1439),

  closesAtMinutes: z
    .number()
    .int()
    .min(1)
    .max(1440),
});

export const specialOpeningDaySchema = z.object({
  date: z.iso.date(),

  isClosed: z.boolean(),

  openingPeriods: z.array(openingPeriodSchema),
});