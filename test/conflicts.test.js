import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conflictKey,
  conflictMessage,
  findConflicts,
} from "../src/modules/calendar-sync/conflicts.js";

const at = (time) => new Date(`2026-11-26T${time}:00+01:00`);

const michiel = {
  id: "a1",
  firstName: "Michiel",
  lastName: "De Smet",
  therapistId: "michael",
  status: "CONFIRMED",
  startTime: at("17:30"),
  endTime: at("19:00"),
};

const setmore = (from, to, extra = {}) => ({
  id: `${from}-${to}`,
  calendarId: "setmore",
  calendarName: "Setmore",
  therapistId: null,
  startTime: at(from),
  endTime: at(to),
  ...extra,
});

test("busy time in the middle of an appointment clashes", () => {
  const pairs = findConflicts([michiel], [setmore("18:00", "18:15")]);

  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].appointment.id, "a1");
});

test("touching or after the appointment does not clash", () => {
  assert.equal(findConflicts([michiel], [setmore("19:00", "19:30")]).length, 0);
  assert.equal(findConflicts([michiel], [setmore("20:15", "20:30")]).length, 0);
  assert.equal(findConflicts([michiel], [setmore("17:00", "17:30")]).length, 0);
});

test("a block of another therapist does not clash", () => {
  const other = setmore("18:00", "18:15", { therapistId: "anna" });

  assert.equal(findConflicts([michiel], [other]).length, 0);
  assert.equal(
    findConflicts([michiel], [{ ...other, therapistId: "michael" }]).length,
    1
  );
});

test("cancelled and no-show appointments never clash", () => {
  for (const status of ["CANCELLED", "NO_SHOW"]) {
    assert.equal(
      findConflicts([{ ...michiel, status }], [setmore("18:00", "18:15")]).length,
      0
    );
  }
});

test("the key changes only when the clashing time changes", () => {
  const a = conflictKey([setmore("18:00", "18:15")]);

  assert.equal(conflictKey([setmore("18:00", "18:15")]), a);
  assert.notEqual(conflictKey([setmore("18:00", "18:30")]), a);
  assert.equal(conflictKey([]), null);
  assert.equal(
    conflictKey([setmore("18:00", "18:15"), setmore("18:30", "18:45")]),
    conflictKey([setmore("18:30", "18:45"), setmore("18:00", "18:15")])
  );
});

test("the push says what overlaps with whom", () => {
  const message = conflictMessage(michiel, [setmore("18:00", "18:15")], "Europe/Brussels");

  assert.equal(message.title, "Dubbele boeking");
  assert.equal(
    message.body,
    "Setmore 18:00–18:15 overlapt met Michiel De Smet (donderdag 26 november 17:30–19:00)."
  );
});
