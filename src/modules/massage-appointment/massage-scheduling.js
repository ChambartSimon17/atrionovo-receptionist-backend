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
//   take place.
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
 * rooms: [{ id, name, appointmentCount }]
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
