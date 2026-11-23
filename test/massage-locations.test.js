import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBusyIntervals,
  buildCandidateMinutes,
  findAvailableSlots,
  intersectPeriods,
  roomPeriodsForDay,
} from "../src/modules/massage-appointment/massage-scheduling.js";
import {
  appointmentTitle,
  buildAppointmentIcs,
} from "../src/modules/calendar-sync/appointment-event.js";
import { matchLocation } from "../src/modules/assistant/assistant-massage.service.js";

// One therapist who works at two locations of her own
// practice: at home (In A Sense) and in a salon (The
// Bridge), each with its own opening hours.

const H = 60 * 60_000;
const day = Date.parse("2026-11-18T00:00:00Z");
const at = (hours) => day + hours * H;
const period = (from, to) => ({ opensAtMinutes: from * 60, closesAtMinutes: to * 60 });

const businessWeek = { isSpecialDay: false, periods: [period(9, 18)] };

const home = {
  id: "home",
  name: "In A Sense",
  hasOwnHours: true,
  openingHours: [period(9, 12)],
};
const bridge = {
  id: "bridge",
  name: "The Bridge",
  hasOwnHours: true,
  openingHours: [period(13, 17)],
};

test("a location uses its own hours instead of the business hours", () => {
  assert.deepEqual(roomPeriodsForDay(bridge, businessWeek), [period(13, 17)]);
});

test("a room without own hours follows the business", () => {
  assert.deepEqual(
    roomPeriodsForDay({ hasOwnHours: false }, businessWeek),
    [period(9, 18)]
  );
});

test("a location without hours that day is closed", () => {
  assert.deepEqual(
    roomPeriodsForDay({ ...bridge, openingHours: [] }, businessWeek),
    []
  );
});

test("a special day of the business also limits a location", () => {
  const holiday = { isSpecialDay: true, periods: [period(10, 14)] };

  assert.deepEqual(roomPeriodsForDay(bridge, holiday), [period(13, 14)]);
  assert.deepEqual(
    roomPeriodsForDay(bridge, { isSpecialDay: true, periods: [] }),
    []
  );
});

test("intersectPeriods keeps only the overlap", () => {
  assert.deepEqual(
    intersectPeriods([period(9, 12), period(13, 17)], [period(11, 14)]),
    [period(11, 12), period(13, 14)]
  );
});

function slots(rooms, appointments = []) {
  const withPeriods = rooms.map((room) => ({
    ...room,
    periods: roomPeriodsForDay(room, businessWeek),
  }));

  const candidates = buildCandidateMinutes({
    openingPeriods: withPeriods.flatMap((room) => room.periods),
    durationMinutes: 60,
    intervalMinutes: 60,
  }).map((minutes) => ({ minutes, startMs: day + minutes * 60_000 }));

  return findAvailableSlots({
    candidates,
    nowMs: 0,
    durationMinutes: 60,
    bufferMinutes: 0,
    therapists: [
      { id: "cindy", name: "Cindy", windows: [{ startMs: at(8), endMs: at(20) }], appointmentCount: 0 },
    ],
    rooms: withPeriods.map((room) => ({
      id: room.id,
      name: room.name,
      hasOwnHours: room.hasOwnHours,
      appointmentCount: 0,
      windows: room.periods.map((p) => ({
        startMs: day + p.opensAtMinutes * 60_000,
        endMs: day + p.closesAtMinutes * 60_000,
      })),
    })),
    busy: buildBusyIntervals(appointments, 0),
  });
}

test("each location is only bookable within its own hours", () => {
  const result = slots([home, bridge]).map((slot) => [
    slot.minutes / 60,
    slot.room.name,
  ]);

  assert.deepEqual(result, [
    [9, "In A Sense"],
    [10, "In A Sense"],
    [11, "In A Sense"],
    [13, "The Bridge"],
    [14, "The Bridge"],
    [15, "The Bridge"],
    [16, "The Bridge"],
  ]);
});

test("one location chosen: only its times", () => {
  const result = slots([bridge]).map((slot) => slot.minutes / 60);

  assert.deepEqual(result, [13, 14, 15, 16]);
});

test("the therapist cannot be at both locations at once", () => {
  const overlapping = {
    ...bridge,
    openingHours: [period(9, 12)],
  };

  // Cindy has a massage at home from 10 to 11.
  const result = slots(
    [home, overlapping],
    [{ therapistId: "cindy", roomId: "home", startMs: at(10), endMs: at(11) }]
  ).map((slot) => slot.minutes / 60);

  assert.deepEqual(result, [9, 11]);
});

test("calendar title starts with the location", () => {
  const appointment = {
    firstName: "Simon",
    lastName: "Best",
    serviceName: "Massage X",
    durationMinutes: 60,
    room: { name: "The Bridge", hasOwnHours: true },
  };

  assert.equal(appointmentTitle(appointment), "The Bridge: Simon Best: Massage X");
});

test("calendar title without locations is unchanged", () => {
  assert.equal(
    appointmentTitle({
      firstName: "Anna",
      lastName: "Peeters",
      serviceName: "Hot stone",
      durationMinutes: 60,
      room: { name: "Kamer 1", hasOwnHours: false },
    }),
    "Hot stone (60 min) – Anna P."
  );
});

test("the calendar event carries the location", () => {
  const ics = buildAppointmentIcs({
    id: "a1",
    firstName: "Simon",
    lastName: "Best",
    phoneNumber: "+32470000000",
    serviceName: "Massage X",
    durationMinutes: 60,
    source: "AI",
    startTime: new Date(at(13)),
    endTime: new Date(at(14)),
    room: { name: "The Bridge", hasOwnHours: true },
  });

  assert.match(ics, /SUMMARY:The Bridge: Simon Best: Massage X/);
  assert.match(ics, /LOCATION:The Bridge/);
});

test("the assistant matches what the caller said to a location", () => {
  const locations = [{ name: "In A Sense" }, { name: "The Bridge" }];

  assert.equal(matchLocation(locations, "the bridge")?.name, "The Bridge");
  assert.equal(matchLocation(locations, "The Bridge in Lanaken")?.name, "The Bridge");
  assert.equal(matchLocation(locations, "In a Sense")?.name, "In A Sense");
  assert.equal(matchLocation(locations, "Hasselt"), null);
  assert.equal(matchLocation(locations, ""), null);
});
