import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inPartOfDay,
  nearestTimes,
  nextDate,
  parseWeekday,
  searchDates,
  spreadTimes,
  weekdayOf,
} from "../src/modules/assistant/massage-search.js";

test("weekday names in Dutch", () => {
  assert.equal(weekdayOf("2026-11-23"), "maandag");
  assert.equal(weekdayOf("2026-11-25"), "woensdag");
  assert.equal(weekdayOf("2026-11-29"), "zondag");
});

test("weekday from what the assistant sends", () => {
  assert.equal(parseWeekday("woensdag"), 3);
  assert.equal(parseWeekday("Woensdag "), 3);
  assert.equal(parseWeekday("WEDNESDAY"), 3);
  assert.equal(parseWeekday("zondag"), 7);
  assert.equal(parseWeekday("morgen"), null);
  assert.equal(parseWeekday(undefined), null);
});

test("search dates, optionally one weekday", () => {
  assert.deepEqual(searchDates("2026-11-30", 3), [
    "2026-11-30",
    "2026-12-01",
    "2026-12-02",
  ]);
  assert.deepEqual(searchDates("2026-11-23", 14, 3), [
    "2026-11-25",
    "2026-12-02",
  ]);
  assert.equal(nextDate("2026-11-30"), "2026-12-01");
});

test("parts of the day", () => {
  const times = ["09:00", "11:45", "12:00", "16:45", "17:00", "19:30"];

  assert.deepEqual(inPartOfDay(times, "ochtend"), ["09:00", "11:45"]);
  assert.deepEqual(inPartOfDay(times, "middag"), ["12:00", "16:45"]);
  assert.deepEqual(inPartOfDay(times, "avond"), ["17:00", "19:30"]);
  assert.deepEqual(inPartOfDay(times, undefined), times);
});

test("a few times spread over the day", () => {
  const times = ["09:00", "09:15", "09:30", "09:45", "10:00", "10:15", "10:30"];

  assert.deepEqual(spreadTimes(times, 3), ["09:00", "09:45", "10:30"]);
  assert.deepEqual(spreadTimes(["09:00", "10:00"], 3), ["09:00", "10:00"]);
});

test("nearest times to the requested one", () => {
  const times = ["15:00", "15:15", "18:00", "18:15", "19:00"];

  assert.deepEqual(nearestTimes(times, "17:00", 2), ["18:00", "18:15"]);
  assert.deepEqual(nearestTimes(times, "15:00", 2), ["15:15", "18:00"]);
});
