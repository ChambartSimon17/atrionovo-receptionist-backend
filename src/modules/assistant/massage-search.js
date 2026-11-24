import { DateTime } from "luxon";

// ======================================================
// Massage search helpers
// ======================================================
//
// Responsibility
// Small pure rules for searching free times over several
// days for the phone assistant: dates, weekdays, parts of
// the day and choosing a few times to say out loud.
//
// The availability itself (opening hours, working hours,
// other appointments, external calendars with travel time,
// the buffer) is computed by massage-availability.service.
// ======================================================

export const DEFAULT_SEARCH_DAYS = 14;
export const MAX_SEARCH_DAYS = 21;

const WEEKDAYS = [
  "maandag",
  "dinsdag",
  "woensdag",
  "donderdag",
  "vrijdag",
  "zaterdag",
  "zondag",
];

const ENGLISH_WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

// Minutes after midnight: [from, until).
export const PARTS_OF_DAY = {
  ochtend: [0, 12 * 60],
  middag: [12 * 60, 17 * 60],
  avond: [17 * 60, 24 * 60],
};

/**
 * "2026-11-25" -> "woensdag".
 */
export function weekdayOf(date) {
  return WEEKDAYS[DateTime.fromISO(date).weekday - 1];
}

/**
 * "woensdag", "Wednesday" or "WEDNESDAY" -> 3 (luxon
 * weekday, Monday = 1). null when not a weekday.
 */
export function parseWeekday(text) {
  const value = String(text ?? "").trim().toLowerCase();

  const dutch = WEEKDAYS.indexOf(value);

  if (dutch >= 0) {
    return dutch + 1;
  }

  const english = ENGLISH_WEEKDAYS.indexOf(value);

  return english >= 0 ? english + 1 : null;
}

/**
 * The days to search: from fromDate (included), count days
 * long, optionally only one weekday.
 */
export function searchDates(fromDate, count, weekday = null) {
  const start = DateTime.fromISO(fromDate);

  const dates = [];

  for (let index = 0; index < count; index++) {
    const day = start.plus({ days: index });

    if (weekday === null || day.weekday === weekday) {
      dates.push(day.toISODate());
    }
  }

  return dates;
}

/**
 * Today in the business's time zone, "YYYY-MM-DD".
 */
export function todayIn(timezone) {
  return DateTime.now().setZone(timezone).toISODate();
}

/**
 * The next day, "YYYY-MM-DD".
 */
export function nextDate(date) {
  return DateTime.fromISO(date).plus({ days: 1 }).toISODate();
}

function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

/**
 * Only the times in a part of the day ("ochtend", "middag",
 * "avond"); all times without a part.
 */
export function inPartOfDay(times, partOfDay) {
  const range = PARTS_OF_DAY[partOfDay];

  if (!range) {
    return times;
  }

  return times.filter((time) => {
    const minutes = toMinutes(time);

    return minutes >= range[0] && minutes < range[1];
  });
}

/**
 * A few times spread over the day, to say out loud: the
 * first, the last and evenly in between. All times when
 * there are only a few.
 */
export function spreadTimes(times, count = 4) {
  if (times.length <= count) {
    return times;
  }

  const picked = new Set();

  for (let index = 0; index < count; index++) {
    picked.add(
      times[Math.round((index * (times.length - 1)) / (count - 1))]
    );
  }

  return [...picked];
}

/**
 * Up to count times closest to the requested time, in time
 * order.
 */
export function nearestTimes(times, time, count) {
  const requested = toMinutes(time);

  return times
    .filter((candidate) => candidate !== time)
    .sort(
      (a, b) =>
        Math.abs(toMinutes(a) - requested) -
          Math.abs(toMinutes(b) - requested) ||
        toMinutes(a) - toMinutes(b)
    )
    .slice(0, count)
    .sort((a, b) => toMinutes(a) - toMinutes(b));
}
