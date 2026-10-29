import { z } from "zod";

// ======================================================
// Opening Hour Validation
// ======================================================
//
// Time is stored as the number of minutes after midnight
// instead of a string ("17:00") or a DateTime.
//
// Examples:
// 00:00 → 0
// 09:30 → 570
// 12:00 → 720
// 17:00 → 1020
// 22:00 → 1320
// 23:59 → 1439
//
// Why?
// - Easier to compare times
// - Easy to calculate reservation durations
// - No timezone or date complications
// - Faster database queries
//
// Business rule:
// Opening and closing times must occur on the same day.
// Overnight opening hours (e.g. 18:00 → 02:00)
// are intentionally not supported yet.
// ======================================================

export const openingHourSchema = z.object({
  dayOfWeek: z.enum([
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
  ]),

  opensAtMinutes: z.number().int().min(0).max(1439),

  closesAtMinutes: z.number().int().min(0).max(1439),
});

export const replaceOpeningHoursSchema = z.object({
  openingHours: z.array(openingHourSchema),
});