import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addExternalBusy,
  buildBusyIntervals,
  findAvailableSlots,
} from "../src/modules/massage-appointment/massage-scheduling.js";

const H = 60 * 60_000;
const day = Date.parse("2026-11-18T00:00:00Z");
const at = (hours) => day + hours * H;

const therapists = [
  { id: "cindy", name: "Cindy", windows: [{ startMs: at(8), endMs: at(20) }], appointmentCount: 0 },
  { id: "tom", name: "Tom", windows: [{ startMs: at(8), endMs: at(20) }], appointmentCount: 0 },
];
const rooms = [{ id: "r1", name: "Kamer", appointmentCount: 0 }];

function slotsWith(blocks, { bufferMinutes = 0, list = therapists } = {}) {
  const busy = addExternalBusy(
    buildBusyIntervals([], bufferMinutes),
    blocks,
    list.map((t) => t.id),
    bufferMinutes
  );

  return findAvailableSlots({
    candidates: [8, 9, 10, 11, 12, 13, 14, 15, 16].map((h) => ({ minutes: h * 60, startMs: at(h) })),
    nowMs: 0,
    durationMinutes: 60,
    bufferMinutes,
    therapists: list,
    rooms,
    busy,
  });
}

const solo = [therapists[0]];

test("a business-wide block takes every therapist", () => {
  const slots = slotsWith(
    [{ startMs: at(10), endMs: at(12), therapistId: null, travelMinutes: 0 }],
    { list: solo }
  );

  assert.deepEqual(slots.map((s) => s.minutes / 60), [8, 9, 12, 13, 14, 15, 16]);
});

test("travel time is blocked before and after, buffer after", () => {
  const slots = slotsWith(
    [{ startMs: at(11), endMs: at(13), therapistId: null, travelMinutes: 30 }],
    { list: solo, bufferMinutes: 15 }
  );

  // 9:00-10:00 + 15 min buffer ends 10:15 <= 10:30 (travel start): ok.
  // 10:00 would end at 11:15: blocked. After: 13:00 + 30 + 15 = 13:45 -> 14:00.
  assert.deepEqual(slots.map((s) => s.minutes / 60), [8, 9, 14, 15, 16]);
});

test("a therapist-specific block leaves the others free", () => {
  const slots = slotsWith([
    { startMs: at(8), endMs: at(20), therapistId: "cindy", travelMinutes: 0 },
  ]);

  assert.equal(slots.length, 9);
  assert.ok(slots.every((s) => s.therapist.id === "tom"));
});

test("the given busy object is not changed", () => {
  const base = buildBusyIntervals([], 0);

  addExternalBusy(base, [{ startMs: at(8), endMs: at(9), therapistId: null }], ["cindy"], 0);

  assert.equal(base.therapist.size, 0);
});
