import { DateTime } from "luxon";

// ======================================================
// Confirmation SMS after a phone call
// ======================================================
//
// Responsibility
// After a phone call the backend sends the caller one SMS
// with what was booked, moved or cancelled during the
// call. Sending after the call (instead of a tool during
// the call) never interrupts or silences the assistant,
// and the text comes from the agenda itself.
//
// Sent through Twilio from the business's smsSenderNumber.
// Needs TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN; without
// them nothing is sent.
// ======================================================

const TWILIO_TIMEOUT_MS = 10_000;

function when(date, timezone) {
  return DateTime.fromJSDate(date)
    .setZone(timezone)
    .setLocale("nl")
    .toFormat("cccc d LLLL 'om' HH:mm");
}

function placeOf(appointment, business) {
  return appointment.room?.hasOwnHours
    ? appointment.room.name
    : business.name;
}

/**
 * The SMS text for the appointments of one call, or null
 * when nothing happened.
 *
 * appointments: [{ status, startTime, createdAt, room? }]
 *   touched during the call.
 * callStartedAt: appointments created after this were
 *   booked in the call; older ones were moved or cancelled.
 */
export function buildCallSms({ appointments, business, callStartedAt }) {
  const lines = appointments
    .slice()
    .sort((a, b) => a.startTime - b.startTime)
    .map((appointment) => {
      const place = placeOf(appointment, business);
      const moment = when(appointment.startTime, business.timezone);
      const isNew = appointment.createdAt >= callStartedAt;

      if (appointment.status === "CANCELLED") {
        return isNew
          ? null
          : `Uw afspraak bij ${place} op ${moment} is geannuleerd.`;
      }

      return isNew
        ? `Uw afspraak bij ${place} op ${moment} is bevestigd.`
        : `Uw afspraak bij ${place} is verplaatst naar ${moment}.`;
    })
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const cancelledOnly = lines.every((line) => line.endsWith("geannuleerd."));

  return [...lines, cancelledOnly ? "Tot een volgende keer!" : "Tot dan!"].join("\n");
}

export function twilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  );
}

/**
 * Sends one SMS through Twilio. Throws with a short, safe
 * message (never the credentials) when Twilio refuses.
 */
export async function sendSms({ from, to, body }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ From: from, To: to, Body: body }),
      signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));

    throw new Error(
      `Twilio answered ${response.status}${error.code ? ` (code ${error.code})` : ""}.`
    );
  }

  const message = await response.json();

  return message.sid;
}
