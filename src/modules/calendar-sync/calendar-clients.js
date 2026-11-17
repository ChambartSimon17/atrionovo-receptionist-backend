import { DAVClient } from "tsdav";
import crypto from "node:crypto";

// ======================================================
// Calendar clients
// ======================================================
//
// Responsibility
// Talk to the outside world: iCloud over CalDAV and ICS
// subscription links over HTTPS. Returns raw iCalendar
// text; parsing lives in ics-parser.js.
//
// Every request has a timeout, so a slow iCloud never
// holds up a phone call or the booking widget for long.
//
// Errors never carry the password or the ICS link: they
// are replaced by short, safe messages (see safeError).
// ======================================================

const ICLOUD_CALDAV_URL = "https://caldav.icloud.com";

const MAX_ICS_BYTES = 10 * 1024 * 1024;

const CLIENT_TTL_MS = 30 * 60_000;

// Logged-in CalDAV clients per connection id. Logging in
// costs a few requests (principal, calendar home).
const clientCache = new Map();

export class CalendarFetchError extends Error {
  constructor(message) {
    super(message);
    this.name = "CalendarFetchError";
  }
}

/**
 * A short message that is safe to store and log: never
 * the URL (an ICS link is a secret) or credentials.
 */
export function safeError(error) {
  if (error instanceof CalendarFetchError) {
    return error.message;
  }

  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    return "Timeout while contacting the calendar.";
  }

  const status = error?.status ?? error?.response?.status;

  if (status === 401 || /401|unauthori[sz]ed/i.test(error?.message ?? "")) {
    return "Login refused (check the Apple ID and app-specific password).";
  }

  if (status) {
    return `Calendar server answered ${status}.`;
  }

  return "Could not reach the calendar.";
}

/**
 * fetch with a timeout per request.
 */
function fetchWithTimeout(timeoutMs) {
  return (url, init = {}) =>
    fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
}

async function getCaldavClient({
  connectionId,
  username,
  password,
  timeoutMs,
}) {
  const cached = clientCache.get(connectionId);

  if (cached && cached.username === username && cached.expiresAt > Date.now()) {
    return cached.client;
  }

  const client = new DAVClient({
    serverUrl: ICLOUD_CALDAV_URL,
    credentials: { username, password },
    authMethod: "Basic",
    defaultAccountType: "caldav",
    fetch: fetchWithTimeout(timeoutMs),
  });

  try {
    await client.login();
  } catch (error) {
    throw new CalendarFetchError(safeError(error));
  }

  clientCache.set(connectionId, {
    client,
    username,
    expiresAt: Date.now() + CLIENT_TTL_MS,
  });

  return client;
}

export function forgetCaldavClient(connectionId) {
  clientCache.delete(connectionId);
}

const normalizeUrl = (url) => url.replace(/\/?$/, "/");

/**
 * The calendars of an iCloud account, including the ones
 * other people shared with it.
 *
 * Returns [{ url, displayName, ctag }].
 */
export async function listCaldavCalendars(credentials) {
  const client = await getCaldavClient(credentials);

  const calendars = await client.fetchCalendars();

  return calendars
    .filter((calendar) =>
      (calendar.components ?? ["VEVENT"]).includes("VEVENT"),
    )
    .map((calendar) => ({
      url: normalizeUrl(calendar.url),
      displayName:
        typeof calendar.displayName === "string"
          ? calendar.displayName
          : "(zonder naam)",
      ctag: calendar.ctag ?? null,
    }));
}

/**
 * iCalendar texts of the events in one calendar that
 * overlap the window (the server expands recurrences only
 * for matching; ics-parser expands them itself).
 */
export async function fetchCaldavEvents(
  credentials,
  calendarUrl,
  { fromMs, toMs },
) {
  const client = await getCaldavClient(credentials);

  try {
    const objects = await client.fetchCalendarObjects({
      calendar: { url: calendarUrl },
      timeRange: {
        start: new Date(fromMs).toISOString(),
        end: new Date(toMs).toISOString(),
      },
    });

    return objects
      .map((object) => object.data)
      .filter((data) => typeof data === "string" && data.length > 0);
  } catch (error) {
    if (error?.status === 401) {
      forgetCaldavClient(credentials.connectionId);
    }

    throw new CalendarFetchError(safeError(error));
  }
}

/**
 * Creates or replaces one event. Our database is the
 * source of the appointment, so an existing event is
 * overwritten without comparing ETags.
 *
 * Returns { url, etag }.
 */
export async function putCaldavEvent(
  credentials,
  { calendarUrl, eventUrl, filename, icsText },
) {
  const client = await getCaldavClient(credentials);

  const url = eventUrl ?? new URL(filename, normalizeUrl(calendarUrl)).href;

  const response = await client.updateCalendarObject({
    calendarObject: { url, data: icsText },
  });

  if (!response.ok) {
    throw new CalendarFetchError(
      `Calendar server answered ${response.status}.`,
    );
  }

  return {
    url,
    etag: response.headers.get("etag"),
  };
}

export async function deleteCaldavEvent(credentials, eventUrl) {
  const client = await getCaldavClient(credentials);

  const response = await client.deleteCalendarObject({
    calendarObject: { url: eventUrl },
  });

  // Already gone is fine.
  if (!response.ok && response.status !== 404) {
    throw new CalendarFetchError(
      `Calendar server answered ${response.status}.`,
    );
  }
}

/**
 * Downloads an ICS subscription link. webcal:// is the
 * same address over https.
 *
 * Returns { text, hash } (hash: to skip unchanged feeds).
 */
export async function fetchIcsFeed(link, { timeoutMs }) {
  const url = link.trim().replace(/^webcals?:\/\//i, "https://");

  let response;

  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "text/calendar" },
    });
  } catch (error) {
    throw new CalendarFetchError(safeError(error));
  }

  if (!response.ok) {
    throw new CalendarFetchError(`Calendar feed answered ${response.status}.`);
  }

  const text = await response.text();

  if (text.length > MAX_ICS_BYTES) {
    throw new CalendarFetchError("Calendar feed is too large.");
  }

  if (!text.includes("BEGIN:VCALENDAR")) {
    throw new CalendarFetchError("The link is not a calendar feed.");
  }

  return {
    text,
    hash: crypto.createHash("sha256").update(text).digest("hex"),
  };
}
