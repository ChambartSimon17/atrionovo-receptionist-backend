// ======================================================
// Therapist Schedule
// ======================================================
//
// Responsibility
// Decide the working periods of a therapist on one date.
//
// 1. The weekly hours are the base.
// 2. A schedule day for that date replaces them (an empty
//    list is a day off).
// 3. Absences are cut out of what remains: a whole-day
//    absence leaves nothing, a partial one removes only
//    its part of the day.
//
// Pure: no database, no clock. Periods are minutes after
// local midnight, like the weekly hours.
// ======================================================

/**
 * Database value of a calendar day ("2026-11-06").
 * Dates are stored as @db.Date, which Prisma reads and
 * writes as UTC midnight.
 */
export function toDbDate(date) {
  return new Date(`${date}T00:00:00.000Z`);
}

export function fromDbDate(value) {
  return value.toISOString().slice(0, 10);
}

/**
 * Calendar day `days` after `date`.
 */
export function addDays(date, days) {
  const value = toDbDate(date);

  value.setUTCDate(value.getUTCDate() + days);

  return fromDbDate(value);
}

/**
 * Whether an absence covers the calendar day.
 */
export function absenceCoversDate(absence, date) {
  return (
    fromDbDate(absence.startDate) <= date &&
    date <= fromDbDate(absence.endDate)
  );
}

function isWholeDay(absence) {
  return (
    absence.startMinutes === null ||
    absence.startMinutes === undefined ||
    absence.endMinutes === null ||
    absence.endMinutes === undefined
  );
}

function subtract(periods, cut) {
  const result = [];

  for (const period of periods) {
    if (
      cut.endMinutes <= period.startMinutes ||
      period.endMinutes <= cut.startMinutes
    ) {
      result.push(period);
      continue;
    }

    if (period.startMinutes < cut.startMinutes) {
      result.push({
        startMinutes: period.startMinutes,
        endMinutes: cut.startMinutes,
      });
    }

    if (cut.endMinutes < period.endMinutes) {
      result.push({
        startMinutes: cut.endMinutes,
        endMinutes: period.endMinutes,
      });
    }
  }

  return result;
}

function byStart(a, b) {
  return a.startMinutes - b.startMinutes;
}

/**
 * The working periods of one date.
 *
 * weekly      periods of the weekly hours for that weekday
 * scheduleDay { periods } or null
 * absences    the absences that cover the date
 *
 * Returns { periods, source, absence }
 *   source:  "WEEKLY" | "CUSTOM" (a schedule day)
 *   absence: the absence that applies, or null
 */
export function resolveDay({
  weekly = [],
  scheduleDay = null,
  absences = [],
}) {
  const planned = (
    scheduleDay ? scheduleDay.periods : weekly
  )
    .map((period) => ({
      startMinutes: period.startMinutes,
      endMinutes: period.endMinutes,
    }))
    .sort(byStart);

  let periods = planned;

  for (const absence of absences) {
    periods = isWholeDay(absence)
      ? []
      : subtract(periods, absence);
  }

  return {
    periods: periods.sort(byStart),
    planned,
    source: scheduleDay ? "CUSTOM" : "WEEKLY",
    absence:
      absences.find(isWholeDay) ?? absences[0] ?? null,
  };
}
