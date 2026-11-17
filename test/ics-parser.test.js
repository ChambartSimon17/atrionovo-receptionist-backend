import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBusyPeriods } from "../src/modules/calendar-sync/ics-parser.js";

const TZ = "Europe/Brussels";

const VTIMEZONE = `BEGIN:VTIMEZONE
TZID:Europe/Brussels
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
DTSTART:19810329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
DTSTART:19961027T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE`;

function cal(body, withTz = true) {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:test\r\n${withTz ? VTIMEZONE + "\n" : ""}${body}\nEND:VCALENDAR`.replace(/\r?\n/g, "\r\n");
}

const iso = (ms) => new Date(ms).toISOString();

const WINDOW = {
  fromMs: Date.parse("2026-11-01T00:00:00Z"),
  toMs: Date.parse("2026-12-01T00:00:00Z"),
  timezone: TZ,
};

test("single event with VTIMEZONE", () => {
  const periods = parseBusyPeriods(
    cal(`BEGIN:VEVENT
UID:a
DTSTART;TZID=Europe/Brussels:20261118T100000
DTEND;TZID=Europe/Brussels:20261118T113000
SUMMARY:Geheim
END:VEVENT`),
    WINDOW
  );

  assert.deepEqual(periods, [
    {
      uid: "a",
      startMs: Date.parse("2026-11-18T09:00:00Z"),
      endMs: Date.parse("2026-11-18T10:30:00Z"),
      allDay: false,
    },
  ]);
});

test("IANA TZID without VTIMEZONE, and UTC times", () => {
  const periods = parseBusyPeriods(
    cal(
      `BEGIN:VEVENT
UID:b
DTSTART;TZID=Europe/Brussels:20260601T100000
DTEND;TZID=Europe/Brussels:20260601T110000
END:VEVENT
BEGIN:VEVENT
UID:c
DTSTART:20260601T120000Z
DTEND:20260601T130000Z
END:VEVENT`,
      false
    ),
    {
      fromMs: Date.parse("2026-06-01T00:00:00Z"),
      toMs: Date.parse("2026-06-02T00:00:00Z"),
      timezone: TZ,
    }
  );

  assert.equal(iso(periods[0].startMs), "2026-06-01T08:00:00.000Z");
  assert.equal(iso(periods[1].startMs), "2026-06-01T12:00:00.000Z");
});

test("floating time is read in the business timezone", () => {
  const periods = parseBusyPeriods(
    cal(`BEGIN:VEVENT
UID:f
DTSTART:20261118T100000
DTEND:20261118T110000
END:VEVENT`, false),
    WINDOW
  );

  assert.equal(iso(periods[0].startMs), "2026-11-18T09:00:00.000Z");
});

test("weekly recurrence across DST, with EXDATE and a moved occurrence", () => {
  const periods = parseBusyPeriods(
    cal(`BEGIN:VEVENT
UID:r
DTSTART;TZID=Europe/Brussels:20261014T090000
DTEND;TZID=Europe/Brussels:20261014T170000
RRULE:FREQ=WEEKLY;BYDAY=WE
EXDATE;TZID=Europe/Brussels:20261111T090000
END:VEVENT
BEGIN:VEVENT
UID:r
RECURRENCE-ID;TZID=Europe/Brussels:20261118T090000
DTSTART;TZID=Europe/Brussels:20261118T130000
DTEND;TZID=Europe/Brussels:20261118T180000
END:VEVENT`),
    WINDOW
  );

  assert.deepEqual(
    periods.map((p) => iso(p.startMs)),
    [
      "2026-11-04T08:00:00.000Z",
      // 11 Nov excluded
      "2026-11-18T12:00:00.000Z", // moved
      "2026-11-25T08:00:00.000Z",
    ]
  );
});

test("free and cancelled events do not block, our own UIDs are skipped", () => {
  const periods = parseBusyPeriods(
    cal(`BEGIN:VEVENT
UID:free
TRANSP:TRANSPARENT
DTSTART:20261118T090000Z
DTEND:20261118T100000Z
END:VEVENT
BEGIN:VEVENT
UID:cancelled
STATUS:CANCELLED
DTSTART:20261118T090000Z
DTEND:20261118T100000Z
END:VEVENT
BEGIN:VEVENT
UID:atrionovo-123@atrionovo.com
DTSTART:20261118T090000Z
DTEND:20261118T100000Z
END:VEVENT`),
    { ...WINDOW, skipUid: (uid) => uid.startsWith("atrionovo-") }
  );

  assert.deepEqual(periods, []);
});

test("busy all-day event blocks the whole local day", () => {
  const periods = parseBusyPeriods(
    cal(`BEGIN:VEVENT
UID:d
DTSTART;VALUE=DATE:20261120
DTEND;VALUE=DATE:20261121
END:VEVENT`),
    WINDOW
  );

  assert.equal(iso(periods[0].startMs), "2026-11-19T23:00:00.000Z");
  assert.equal(iso(periods[0].endMs), "2026-11-20T23:00:00.000Z");
  assert.equal(periods[0].allDay, true);
});

test("events outside the window are left out", () => {
  const periods = parseBusyPeriods(
    cal(`BEGIN:VEVENT
UID:old
DTSTART:20250101T090000Z
DTEND:20250101T100000Z
END:VEVENT`),
    WINDOW
  );

  assert.deepEqual(periods, []);
});
