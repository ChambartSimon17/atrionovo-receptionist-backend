// ======================================================
// Time Utilities
// ======================================================
//
// Responsibility
// Shared helper functions for converting between
// dates, times and "minutes since midnight".
//
// All business logic should use these helpers instead
// of performing manual time calculations.
// ======================================================

/**
 * Converts minutes since midnight into HH:mm.
 *
 * Example:
 * 780 -> "13:00"
 */
export function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/**
 * Converts a Date into minutes since midnight
 * in the specified IANA timezone.
 *
 * Example:
 * Europe/Brussels
 * 2026-08-03T14:00:00.000Z
 *
 * =>
 *
 * 960 (16:00)
 */
export function dateToMinutes(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);

  const hour = Number(
    parts.find((part) => part.type === "hour").value
  );

  const minute = Number(
    parts.find((part) => part.type === "minute").value
  );

  return hour * 60 + minute;
}

/**
 * Returns the weekday in the specified
 * IANA timezone.
 */
export function dateToDayOfWeek(date, timezone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  })
    .format(date)
    .toUpperCase();
}

/**
 * Returns a new Date after adding the specified
 * number of minutes.
 */
export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000);
}