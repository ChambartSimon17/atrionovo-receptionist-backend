import ValidationError from "../../errors/ValidationError.js";
import { ErrorCodes } from "../../errors/error-codes.js";

/**
 * Validates the weekly working hours of a therapist:
 * every period must start before it ends and periods of
 * the same day may not overlap (touching is allowed).
 */
export function validateWorkingHours(workingHours) {
  for (const period of workingHours) {
    if (period.startMinutes >= period.endMinutes) {
      throw new ValidationError(
        "A working period must start before it ends.",
        ErrorCodes.INVALID_WORKING_HOURS
      );
    }
  }

  const byDay = new Map();

  for (const period of workingHours) {
    const periods = byDay.get(period.dayOfWeek) ?? [];

    periods.push(period);
    byDay.set(period.dayOfWeek, periods);
  }

  for (const periods of byDay.values()) {
    periods.sort(
      (a, b) => a.startMinutes - b.startMinutes
    );

    for (let i = 1; i < periods.length; i++) {
      if (
        periods[i].startMinutes <
        periods[i - 1].endMinutes
      ) {
        throw new ValidationError(
          "Working periods on the same day may not overlap.",
          ErrorCodes.INVALID_WORKING_HOURS
        );
      }
    }
  }
}
