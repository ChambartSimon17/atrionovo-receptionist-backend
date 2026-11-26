import { DateTime } from "luxon";

// ======================================================
// Conflicts with external calendars
// ======================================================
//
// Responsibility
// Find appointments that overlap busy time from the
// business's own calendars (Setmore, iCloud) that was
// added after the appointment was booked. New bookings
// already avoid busy time; this only catches what changed
// later in the other calendar.
//
// Pure: no database, no clock.
// ======================================================

// Appointments that still take place (or took place).
export const CONFLICT_STATUSES = ["CONFIRMED", "COMPLETED"];

/**
 * Pairs of an appointment and a busy block that overlap in
 * time. A block of one therapist only clashes with that
 * therapist's appointments; a block without a therapist
 * (a one-person practice) with all of them.
 *
 * appointments: [{ id, therapistId, status, startTime,
 *                  endTime }]
 * blocks: [{ id, startTime, endTime, therapistId }]
 * Times are Dates.
 */
export function findConflicts(appointments, blocks) {
  const pairs = [];

  for (const appointment of appointments) {
    if (!CONFLICT_STATUSES.includes(appointment.status)) {
      continue;
    }

    for (const block of blocks) {
      const sameTherapist =
        !block.therapistId ||
        block.therapistId === appointment.therapistId;

      const overlaps =
        block.startTime < appointment.endTime &&
        appointment.startTime < block.endTime;

      if (sameTherapist && overlaps) {
        pairs.push({ appointment, block });
      }
    }
  }

  return pairs;
}

/**
 * A key for the set of blocks one appointment overlaps, so
 * a notification is sent once per new or changed conflict.
 * null when there is none.
 */
export function conflictKey(blocks) {
  if (blocks.length === 0) {
    return null;
  }

  return blocks
    .map(
      (block) =>
        `${block.calendarId ?? ""}:${block.startTime.toISOString()}-${block.endTime.toISOString()}`
    )
    .sort()
    .join("|");
}

function hhmm(date, timezone) {
  return DateTime.fromJSDate(date).setZone(timezone).toFormat("HH:mm");
}

/**
 * The push text for one appointment and the blocks it
 * overlaps.
 */
export function conflictMessage(appointment, blocks, timezone) {
  const day = DateTime.fromJSDate(appointment.startTime)
    .setZone(timezone)
    .setLocale("nl")
    .toFormat("cccc d LLLL");

  const what = blocks
    .map(
      (block) =>
        `${block.calendarName} ${hhmm(block.startTime, timezone)}–${hhmm(block.endTime, timezone)}`
    )
    .join(", ");

  const name = [appointment.firstName, appointment.lastName]
    .filter(Boolean)
    .join(" ");

  return {
    title: "Dubbele boeking",
    body: `${what} overlapt met ${name} (${day} ${hhmm(appointment.startTime, timezone)}–${hhmm(appointment.endTime, timezone)}).`,
  };
}
