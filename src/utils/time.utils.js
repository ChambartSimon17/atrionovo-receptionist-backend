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
 * Returns the UTC range for a specific calendar day
 * in the specified IANA timezone.
 *
 * Example:
 *
 * date     = "2026-08-27"
 * timezone = "Europe/Brussels"
 *
 * Returns the UTC start and end of that local day.
 */
export function getUtcRangeForLocalDay(date, timezone) {
  const [year, month, day] = date.split("-").map(Number);

  const getOffsetMinutes = (utcDate) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "longOffset",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(utcDate);

    const offset = parts.find(
      (part) => part.type === "timeZoneName"
    )?.value;

    if (!offset || offset === "GMT") {
      return 0;
    }

    const match = offset.match(/GMT([+-])(\d{2}):?(\d{2})?/);

    if (!match) {
      return 0;
    }

    const sign = match[1] === "+" ? 1 : -1;
    const hours = Number(match[2]);
    const minutes = Number(match[3] || 0);

    return sign * (hours * 60 + minutes);
  };

  const localMidnightAsUtc = new Date(
    Date.UTC(year, month - 1, day, 0, 0, 0)
  );

  const offsetMinutes = getOffsetMinutes(localMidnightAsUtc);

  const startOfDay = new Date(
    localMidnightAsUtc.getTime() - offsetMinutes * 60 * 1000
  );

  const nextDate = new Date(
    Date.UTC(year, month - 1, day + 1, 0, 0, 0)
  );

  const nextOffsetMinutes = getOffsetMinutes(nextDate);

  const startOfNextDay = new Date(
    nextDate.getTime() - nextOffsetMinutes * 60 * 1000
  );

  return {
    start: startOfDay,
    end: startOfNextDay,
  };
}

/**
 * Returns a new Date after adding the specified
 * number of minutes.
 */
export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000);
}