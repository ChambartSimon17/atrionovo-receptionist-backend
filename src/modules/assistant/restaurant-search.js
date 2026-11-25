import { inPartOfDay } from "./massage-search.js";

// ======================================================
// Restaurant search helpers
// ======================================================
//
// Responsibility
// Small pure rules for the phone assistant of a restaurant:
// which arrival times to try when a time is full.
//
// A restaurant guest usually wants the same lunch or the
// same evening, not another day. So the first search stays
// in the same "seating window": the opening period of the
// requested time, at most SEATING_WINDOW_MINUTES before or
// after it. Only when that window is full do we look at
// other days.
//
// Whether a time is really free (opening hours, arrival
// interval, group size, capacity, a table combination) is
// decided by the reservation eligibility and table
// assignment services, never here.
// ======================================================

export const SEATING_WINDOW_MINUTES = 120;

// Above this many candidate times in one day, a multi-day
// search tries every half hour instead of every quarter,
// to keep a tool call well under Vapi's timeout.
export const MAX_CANDIDATES_PER_DAY = 12;

export function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

export function toTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60
  ).padStart(2, "0")}`;
}

/**
 * Every arrival time of the day at which a reservation of
 * durationMinutes still ends before closing, per interval.
 * periods: [{ opensAtMinutes, closesAtMinutes }].
 */
export function arrivalTimes(periods, durationMinutes, intervalMinutes) {
  const times = [];

  for (const period of [...periods].sort(
    (a, b) => a.opensAtMinutes - b.opensAtMinutes
  )) {
    for (
      let minutes = period.opensAtMinutes;
      minutes + durationMinutes <= period.closesAtMinutes;
      minutes += intervalMinutes
    ) {
      times.push(toTime(minutes));
    }
  }

  return times;
}

/**
 * The arrival times in the same seating window as time:
 * same opening period, at most SEATING_WINDOW_MINUTES away.
 * Without a matching period (the time is outside the
 * opening hours), the window around the time is used, so a
 * guest asking 23:00 still hears the last times of the
 * evening.
 */
export function seatingWindow(
  periods,
  time,
  durationMinutes,
  intervalMinutes
) {
  const requested = toMinutes(time);

  const period = periods.find(
    (p) => requested >= p.opensAtMinutes && requested < p.closesAtMinutes
  );

  const candidates = arrivalTimes(
    period ? [period] : periods,
    durationMinutes,
    intervalMinutes
  );

  return candidates.filter(
    (candidate) =>
      Math.abs(toMinutes(candidate) - requested) <= SEATING_WINDOW_MINUTES
  );
}

/**
 * The times to try on one day of a multi-day search:
 * exactly the requested time, or every arrival time
 * (optionally in a part of the day), thinned out to every
 * half hour when there are too many.
 */
export function candidateTimes({
  periods,
  durationMinutes,
  intervalMinutes,
  time,
  partOfDay,
}) {
  const all = arrivalTimes(periods, durationMinutes, intervalMinutes);

  if (time) {
    return all.includes(time) ? [time] : [];
  }

  const inPart = inPartOfDay(all, partOfDay);

  if (inPart.length <= MAX_CANDIDATES_PER_DAY) {
    return inPart;
  }

  return inPart.filter((candidate) => toMinutes(candidate) % 30 === 0);
}

/**
 * Runs fn over items, size at a time, and stops as soon as
 * done(results) is true. Keeps the number of parallel
 * database queries small.
 */
export async function inBatches(items, size, fn, done = () => false) {
  const results = [];

  for (let index = 0; index < items.length; index += size) {
    const batch = await Promise.all(items.slice(index, index + size).map(fn));

    results.push(...batch);

    if (done(results)) {
      break;
    }
  }

  return results;
}
