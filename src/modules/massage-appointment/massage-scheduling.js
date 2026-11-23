// ======================================================
// Massage Scheduling
// ======================================================
//
// Responsibility
// Decide which start times can be booked for a massage
// and which therapist and room take the appointment.
//
// Everything here is pure: no database, no clock, no
// timezone. The caller passes instants as milliseconds,
// which keeps the rules easy to test and correct on days
// when the clocks change.
//
// Rules
//
// - The massage must fit inside one opening period.
// - A therapist is needed who can perform the massage and
//   whose working hours cover the whole massage.
// - A treatment room is needed in which the massage can
//   take place. A room with its own hours (a location of
//   the practice) must be open for the whole massage.
// - After every appointment the therapist and the room are
//   blocked for an extra buffer (cleaning, rest). A new
//   appointment may not overlap the occupied time of an
//   existing one, so the gap between two appointments is at
//   least the buffer on both sides.
// - When several therapists or rooms are free, the one with
//   the fewest appointments that day is chosen, then the
//   one that comes first alphabetically.
//
// Appointments are never moved afterwards, so the choice is
// greedy: it does not look ahead to keep a particular
// therapist or room free for later bookings.
// ======================================================

const MINUTE_MS = 60_000;

/**
 * Start times (minutes after local midnight) at which a
 * massage of the given length fits inside an opening
 * period, aligned to the arrival interval.
 *
 * openingPeriods: [{ opensAtMinutes, closesAtMinutes }]
 */
export function buildCandidateMinutes({
  openingPeriods,
  durationMinutes,
  intervalMinutes,
}) {
  const candidates = new Set();

  for (const period of openingPeriods) {
    const first =
      Math.ceil(
        period.opensAtMinutes / intervalMinutes
      ) * intervalMinutes;

    for (
      let minutes = first;
      minutes + durationMinutes <=
      period.closesAtMinutes;
      minutes += intervalMinutes
    ) {
      candidates.add(minutes);
    }
  }

  return [...candidates].sort((a, b) => a - b);
}

/**
 * The periods in which both lists are open.
 *
 * a, b: [{ opensAtMinutes, closesAtMinutes }]
 */
export function intersectPeriods(a, b) {
  const result = [];

  for (const first of a) {
    for (const second of b) {
      const opensAtMinutes = Math.max(
        first.opensAtMinutes,
        second.opensAtMinutes
      );
      const closesAtMinutes = Math.min(
        first.closesAtMinutes,
        second.closesAtMinutes
      );

      if (opensAtMinutes < closesAtMinutes) {
        result.push({ opensAtMinutes, closesAtMinutes });
      }
    }
  }

  return result.sort(
    (x, y) => x.opensAtMinutes - y.opensAtMinutes
  );
}

/**
 * Opening periods of one room on one day.
 *
 * - A room without its own hours follows the business.
 * - A room with its own hours (a location) uses its hours
 *   for that weekday instead of the weekly hours of the
 *   business. On a special opening day of the business
 *   (a holiday, a closure) only the overlap is open.
 *
 * room: { hasOwnHours, openingHours: [{ opensAtMinutes,
 *         closesAtMinutes }] } (hours of that weekday)
 * schedule: { isSpecialDay, periods } of the business.
 */
export function roomPeriodsForDay(room, schedule) {
  if (!room.hasOwnHours) {
    return schedule.periods;
  }

  const own = room.openingHours ?? [];

  return schedule.isSpecialDay
    ? intersectPeriods(own, schedule.periods)
    : [...own].sort(
        (a, b) => a.opensAtMinutes - b.opensAtMinutes
      );
}

function overlaps(intervals, startMs, endMs) {
  return intervals.some(
    (interval) =>
      interval.startMs < endMs &&
      startMs < interval.endMs
  );
}

function byLoadThenName(a, b) {
  return (
    a.appointmentCount - b.appointmentCount ||
    a.name.localeCompare(b.name)
  );
}

/**
 * Finds a therapist and a room for one start time.
 * Returns null when either is missing.
 *
 * therapists: [{ id, name, windows: [{ startMs, endMs }],
 *                appointmentCount }]
 *   windows = working periods of that day, already limited
 *   to therapists who can perform the massage.
 * rooms: [{ id, name, appointmentCount, windows? }]
 *   windows = opening periods of a room with its own hours
 *   (a location). Without windows the room follows the
 *   opening hours of the business.
 * busy: { therapist: Map<id, [{ startMs, endMs }]>,
 *         room: Map<id, [{ startMs, endMs }]> }
 *   Busy intervals already include the buffer.
 */
export function findFreeResources({
  startMs,
  durationMinutes,
  bufferMinutes,
  therapists,
  rooms,
  busy,
}) {
  const endMs = startMs + durationMinutes * MINUTE_MS;

  // Time the new appointment would occupy, buffer included.
  const occupiedEndMs =
    endMs + bufferMinutes * MINUTE_MS;

  const freeTherapists = therapists
    .filter(
      (therapist) =>
        therapist.windows.some(
          (window) =>
            window.startMs <= startMs &&
            endMs <= window.endMs
        ) &&
        !overlaps(
          busy.therapist.get(therapist.id) ?? [],
          startMs,
          occupiedEndMs
        )
    )
    .sort(byLoadThenName);

  if (freeTherapists.length === 0) {
    return null;
  }

  const freeRooms = rooms
    .filter(
      (room) =>
        (!room.windows ||
          room.windows.some(
            (window) =>
              window.startMs <= startMs &&
              endMs <= window.endMs
          )) &&
        !overlaps(
          busy.room.get(room.id) ?? [],
          startMs,
          occupiedEndMs
        )
    )
    .sort(byLoadThenName);

  if (freeRooms.length === 0) {
    return null;
  }

  return {
    therapist: freeTherapists[0],
    room: freeRooms[0],
  };
}

/**
 * All bookable start times of one day, each with the
 * therapist and room that would take the appointment.
 *
 * candidates: [{ minutes, startMs }]
 * nowMs: start times at or before this instant are skipped.
 */
export function findAvailableSlots({
  candidates,
  nowMs,
  durationMinutes,
  bufferMinutes,
  therapists,
  rooms,
  busy,
}) {
  const slots = [];

  for (const candidate of candidates) {
    if (candidate.startMs <= nowMs) {
      continue;
    }

    const resources = findFreeResources({
      startMs: candidate.startMs,
      durationMinutes,
      bufferMinutes,
      therapists,
      rooms,
      busy,
    });

    if (resources) {
      slots.push({
        minutes: candidate.minutes,
        startMs: candidate.startMs,
        therapist: resources.therapist,
        room: resources.room,
      });
    }
  }

  return slots;
}

/**
 * Turns appointments into busy intervals per therapist and
 * per room (the appointment plus the buffer), and counts
 * the appointments of each resource.
 *
 * appointments: [{ therapistId, roomId, startMs, endMs }]
 */
export function buildBusyIntervals(
  appointments,
  bufferMinutes
) {
  const busy = {
    therapist: new Map(),
    room: new Map(),
  };

  function add(map, id, interval) {
    const list = map.get(id) ?? [];

    list.push(interval);
    map.set(id, list);
  }

  for (const appointment of appointments) {
    const interval = {
      startMs: appointment.startMs,
      endMs:
        appointment.endMs +
        bufferMinutes * MINUTE_MS,
    };

    add(busy.therapist, appointment.therapistId, interval);
    add(busy.room, appointment.roomId, interval);
  }

  return busy;
}

/**
 * Adds busy time from external calendars (iCloud, a
 * Setmore feed) to the therapists' busy intervals.
 *
 * blocks: [{ startMs, endMs, therapistId, travelMinutes }]
 *   therapistId null: blocks every therapist (a one-person
 *   practice). travelMinutes: time to get to and from the
 *   other location, before and after the block.
 * therapistIds: the therapists of the day.
 *
 * Like an appointment, a block is followed by the buffer;
 * a new appointment already keeps its own buffer before
 * the block. External blocks never occupy a room and do
 * not count as appointments.
 *
 * Returns a new busy object; the given one is unchanged,
 * so appointment counts can still be taken from it.
 */
export function addExternalBusy(
  busy,
  blocks,
  therapistIds,
  bufferMinutes
) {
  const therapist = new Map(
    [...busy.therapist].map(([id, list]) => [id, [...list]])
  );

  for (const block of blocks) {
    const travelMs = (block.travelMinutes ?? 0) * MINUTE_MS;

    const interval = {
      startMs: block.startMs - travelMs,
      endMs:
        block.endMs +
        travelMs +
        bufferMinutes * MINUTE_MS,
    };

    const ids = block.therapistId
      ? [block.therapistId]
      : therapistIds;

    for (const id of ids) {
      const list = therapist.get(id) ?? [];

      list.push(interval);
      therapist.set(id, list);
    }
  }

  return { therapist, room: busy.room };
}
