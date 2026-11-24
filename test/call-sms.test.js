import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCallSms } from "../src/modules/insights/call-sms.js";

const business = { name: "In A Sense", timezone: "Europe/Brussels" };
const callStartedAt = new Date("2026-11-24T14:00:00Z");
const during = new Date("2026-11-24T14:02:00Z");
const before = new Date("2026-11-20T10:00:00Z");
const bridge = { name: "The Bridge", hasOwnHours: true };

test("a booking during the call is confirmed, with the location", () => {
  const sms = buildCallSms({
    business,
    callStartedAt,
    appointments: [
      { status: "CONFIRMED", startTime: new Date("2026-11-25T17:00:00Z"), createdAt: during, room: bridge },
    ],
  });

  assert.equal(
    sms,
    "Uw afspraak bij The Bridge op woensdag 25 november om 18:00 is bevestigd.\nTot dan!"
  );
});

test("without locations the business name is used", () => {
  const sms = buildCallSms({
    business,
    callStartedAt,
    appointments: [
      { status: "CONFIRMED", startTime: new Date("2026-11-25T17:00:00Z"), createdAt: during, room: { name: "Kamer 1", hasOwnHours: false } },
    ],
  });

  assert.match(sms, /^Uw afspraak bij In A Sense op woensdag 25 november om 18:00 is bevestigd\./);
});

test("an older appointment changed during the call was moved", () => {
  const sms = buildCallSms({
    business,
    callStartedAt,
    appointments: [
      { status: "CONFIRMED", startTime: new Date("2026-11-27T09:30:00Z"), createdAt: before, room: bridge },
    ],
  });

  assert.equal(
    sms,
    "Uw afspraak bij The Bridge is verplaatst naar vrijdag 27 november om 10:30.\nTot dan!"
  );
});

test("a cancellation", () => {
  const sms = buildCallSms({
    business,
    callStartedAt,
    appointments: [
      { status: "CANCELLED", startTime: new Date("2026-11-27T09:30:00Z"), createdAt: before, room: bridge },
    ],
  });

  assert.equal(
    sms,
    "Uw afspraak bij The Bridge op vrijdag 27 november om 10:30 is geannuleerd.\nTot een volgende keer!"
  );
});

test("booked and cancelled in the same call: no SMS", () => {
  assert.equal(
    buildCallSms({
      business,
      callStartedAt,
      appointments: [
        { status: "CANCELLED", startTime: new Date("2026-11-25T17:00:00Z"), createdAt: during, room: bridge },
      ],
    }),
    null
  );
});

test("nothing happened: no SMS", () => {
  assert.equal(buildCallSms({ business, callStartedAt, appointments: [] }), null);
});
