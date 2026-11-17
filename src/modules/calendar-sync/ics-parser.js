import ICAL from "ical.js";
import { DateTime, IANAZone } from "luxon";

// ======================================================
// ICS parser
// ======================================================
//
// Responsibility
// Turn iCalendar text (an ICS feed, or the events a CalDAV
// server returns) into busy periods within a time window.
//
// Pure: no network, no database, no clock.
//
// Rules
// - Recurring events are expanded into one period per
//   occurrence; moved and cancelled occurrences
//   (RECURRENCE-ID, EXDATE) are respected.
// - Events marked free (TRANSP:TRANSPARENT) or cancelled
//   (STATUS:CANCELLED) do not block.
// - All-day events block the whole local day(s). Apple
//   Calendar marks all-day events "free" by default, so
//   birthdays and reminders do not block; an all-day event
//   set to "busy" (holiday) does.
// - Times without a timezone and all-day dates are read in
//   the business's timezone.
// - Only times and the UID are kept; titles, locations and
//   descriptions are never read out.
// ======================================================

const MAX_OCCURRENCES_PER_EVENT = 5000;

/**
 * Milliseconds of an ICAL.Time.
 *
 * ical.js only converts times whose VTIMEZONE is in the
 * same file. Feeds often name an IANA zone without
 * including it (TZID=Europe/Brussels), so known IANA names
 * are converted with luxon instead.
 */
function timeToMs(time, fallbackZone) {
  if (time.isDate) {
    return DateTime.fromObject(
      {
        year: time.year,
        month: time.month,
        day: time.day,
      },
      { zone: fallbackZone },
    ).toMillis();
  }

  const tzid = time.zone?.tzid ?? time.timezone;

  if (tzid === "UTC" || tzid === "Z") {
    return time.toUnixTime() * 1000;
  }

  const zone =
    tzid && IANAZone.isValidZone(tzid)
      ? tzid
      : time.zone &&
          time.zone !== ICAL.Timezone.localTimezone &&
          tzid !== "floating"
        ? null
        : fallbackZone;

  if (zone === null) {
    // A VTIMEZONE from the file (Outlook names such as
    // "W. Europe Standard Time").
    return time.toUnixTime() * 1000;
  }

  return DateTime.fromObject(
    {
      year: time.year,
      month: time.month,
      day: time.day,
      hour: time.hour,
      minute: time.minute,
      second: time.second,
    },
    { zone },
  ).toMillis();
}

function isBlocking(component) {
  const transp = component.getFirstPropertyValue("transp")?.toUpperCase();

  const status = component.getFirstPropertyValue("status")?.toUpperCase();

  return transp !== "TRANSPARENT" && status !== "CANCELLED";
}

function registerTimezones(root) {
  for (const vtimezone of root.getAllSubcomponents("vtimezone")) {
    const timezone = new ICAL.Timezone(vtimezone);

    if (!ICAL.TimezoneService.has(timezone.tzid)) {
      ICAL.TimezoneService.register(timezone);
    }
  }
}

function parseRoots(icsText) {
  const parsed = ICAL.parse(icsText);

  // One VCALENDAR, or several concatenated.
  const list = typeof parsed[0] === "string" ? [parsed] : parsed;

  return list.map((jcal) => new ICAL.Component(jcal));
}

/**
 * Busy periods of the events in icsText that overlap
 * [fromMs, toMs).
 *
 * Returns [{ uid, startMs, endMs, allDay }].
 *
 * options.skipUid(uid) leaves out events by UID (our own
 * appointments written into the calendar).
 */
export function parseBusyPeriods(
  icsText,
  { fromMs, toMs, timezone, skipUid = () => false },
) {
  const periods = [];

  for (const root of parseRoots(icsText)) {
    registerTimezones(root);

    // Masters and their moved occurrences, per UID.
    const byUid = new Map();

    for (const component of root.getAllSubcomponents("vevent")) {
      const uid = component.getFirstPropertyValue("uid") ?? "";

      if (skipUid(uid)) {
        continue;
      }

      const entry = byUid.get(uid) ?? {
        master: null,
        exceptions: [],
      };

      if (component.hasProperty("recurrence-id")) {
        entry.exceptions.push(component);
      } else {
        entry.master = component;
      }

      byUid.set(uid, entry);
    }

    for (const [uid, entry] of byUid) {
      collectPeriods({
        uid,
        entry,
        fromMs,
        toMs,
        timezone,
        periods,
      });
    }
  }

  return periods.sort((a, b) => a.startMs - b.startMs);
}

function pushIfOverlapping(periods, period, fromMs, toMs) {
  if (
    period.endMs > period.startMs &&
    period.startMs < toMs &&
    fromMs < period.endMs
  ) {
    periods.push(period);
  }
}

function collectPeriods({ uid, entry, fromMs, toMs, timezone, periods }) {
  // Moved occurrences without their master (CalDAV can
  // return only the changed instance): each one on its own.
  if (!entry.master) {
    for (const component of entry.exceptions) {
      if (!isBlocking(component)) {
        continue;
      }

      const event = new ICAL.Event(component);

      pushIfOverlapping(
        periods,
        {
          uid,
          startMs: timeToMs(event.startDate, timezone),
          endMs: timeToMs(event.endDate, timezone),
          allDay: event.startDate.isDate,
        },
        fromMs,
        toMs,
      );
    }

    return;
  }

  const event = new ICAL.Event(entry.master, {
    exceptions: entry.exceptions,
  });

  if (!event.isRecurring()) {
    if (!isBlocking(entry.master)) {
      return;
    }

    pushIfOverlapping(
      periods,
      {
        uid,
        startMs: timeToMs(event.startDate, timezone),
        endMs: timeToMs(event.endDate, timezone),
        allDay: event.startDate.isDate,
      },
      fromMs,
      toMs,
    );

    return;
  }

  const iterator = event.iterator();

  for (
    let count = 0, next = iterator.next();
    next && count < MAX_OCCURRENCES_PER_EVENT;
    count++, next = iterator.next()
  ) {
    const details = event.getOccurrenceDetails(next);

    const startMs = timeToMs(details.startDate, timezone);

    if (startMs >= toMs) {
      break;
    }

    // A moved occurrence carries its own TRANSP/STATUS.
    if (!isBlocking(details.item.component)) {
      continue;
    }

    pushIfOverlapping(
      periods,
      {
        uid,
        startMs,
        endMs: timeToMs(details.endDate, timezone),
        allDay: details.startDate.isDate,
      },
      fromMs,
      toMs,
    );
  }
}
