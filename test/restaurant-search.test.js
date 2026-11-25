import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arrivalTimes,
  candidateTimes,
  inBatches,
  seatingWindow,
} from "../src/modules/assistant/restaurant-search.js";

const LUNCH_AND_DINNER = [
  { opensAtMinutes: 12 * 60, closesAtMinutes: 14 * 60 + 30 },
  { opensAtMinutes: 18 * 60 + 30, closesAtMinutes: 22 * 60 },
];

const ALL_DAY = [{ opensAtMinutes: 9 * 60, closesAtMinutes: 22 * 60 }];

test("arrival times end before closing", () => {
  assert.deepEqual(arrivalTimes(LUNCH_AND_DINNER, 120, 15), [
    "12:00",
    "12:15",
    "12:30",
    "18:30",
    "18:45",
    "19:00",
    "19:15",
    "19:30",
    "19:45",
    "20:00",
  ]);
});

test("seating window stays in the same service", () => {
  // Dinner at 19:30: only dinner times, never lunch.
  assert.deepEqual(seatingWindow(LUNCH_AND_DINNER, "19:30", 120, 15), [
    "18:30",
    "18:45",
    "19:00",
    "19:15",
    "19:30",
    "19:45",
    "20:00",
  ]);
});

test("seating window is at most two hours away in an all-day restaurant", () => {
  const window = seatingWindow(ALL_DAY, "19:30", 120, 15);

  assert.equal(window[0], "17:30");
  assert.equal(window.at(-1), "20:00");
});

test("a time after closing still gets the last times of the evening", () => {
  assert.deepEqual(seatingWindow(ALL_DAY, "21:30", 120, 15).slice(-2), [
    "19:45",
    "20:00",
  ]);
});

test("candidate times for a multi-day search", () => {
  const base = { periods: ALL_DAY, durationMinutes: 120, intervalMinutes: 15 };

  assert.deepEqual(candidateTimes({ ...base, time: "19:00" }), ["19:00"]);
  assert.deepEqual(candidateTimes({ ...base, time: "21:30" }), []);

  // An evening: 17:00 to 20:00 per quarter is 13 times, so
  // every half hour.
  assert.deepEqual(candidateTimes({ ...base, partOfDay: "avond" }), [
    "17:00",
    "17:30",
    "18:00",
    "18:30",
    "19:00",
    "19:30",
    "20:00",
  ]);

  // Dinner only: few enough to try every quarter.
  assert.equal(
    candidateTimes({ ...base, periods: LUNCH_AND_DINNER, partOfDay: "avond" })
      .length,
    7
  );
});

test("batches stop as soon as enough is found", async () => {
  const seen = [];

  const results = await inBatches(
    [1, 2, 3, 4, 5, 6, 7],
    3,
    async (n) => {
      seen.push(n);
      return n;
    },
    (done) => done.length >= 3
  );

  assert.deepEqual(results, [1, 2, 3]);
  assert.deepEqual(seen, [1, 2, 3]);
});
