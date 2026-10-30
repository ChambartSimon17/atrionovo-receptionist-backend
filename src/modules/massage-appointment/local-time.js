import { DateTime } from "luxon";

// ======================================================
// Local Time
// ======================================================
//
// Conversions between a business-local calendar day,
// "minutes after local midnight" and UTC instants.
//
// The conversions follow the wall clock of the business
// timezone, so they stay correct on the two days a year
// when the clocks change.
// ======================================================

/**
 * Instant (ms since epoch) of a local wall-clock time.
 *
 * date    = "2026-11-02" (business-local calendar day)
 * minutes = minutes after local midnight; 1440 means the
 *           end of the day (next local midnight).
 */
export function localMinutesToMs(
  date,
  minutes,
  timezone
) {
  const day = DateTime.fromISO(date, {
    zone: timezone,
  }).startOf("day");

  if (minutes >= 1440) {
    return day.plus({ days: 1 }).toMillis();
  }

  return day
    .set({
      hour: Math.floor(minutes / 60),
      minute: minutes % 60,
    })
    .toMillis();
}

/**
 * Business-local calendar day ("YYYY-MM-DD") of an instant.
 */
export function localDateOf(instant, timezone) {
  return DateTime.fromJSDate(new Date(instant), {
    zone: timezone,
  }).toISODate();
}

/**
 * Whether the text is a real calendar day.
 */
export function isValidCalendarDate(date) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    DateTime.fromISO(date).isValid
  );
}
