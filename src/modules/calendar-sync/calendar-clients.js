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
  /**
   * reason: a short code the app turns into its own text
   * (LINK_REFUSED, FEED_GONE, NOT_A_CALENDAR, TIMEOUT,
   * UNREACHABLE). The message itself is already Dutch, for
   * app versions that do not know the code.
   */
  constructor(message, reason) {
    super(message);
    this.name = "CalendarFetchError";
    this.reason = reason;
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

// Some providers (Setmore) only answer calendar apps and
// refuse other clients with 401. Present ourselves the way
// Apple Calendar does.
export const ICS_REQUEST_HEADERS = {
  "User-Agent": "macOS/15.0 (24A335) CalendarAgent/1000",
  Accept: "text/calendar, */*;q=0.8",
};

export const ICS_TIMEOUT_MS = 10_000;

const ICS_MESSAGES = {
  LINK_REFUSED:
    "Deze link is verlopen of wordt geweigerd. Maak in Setmore een nieuwe link aan via Settings → My Profile → Calendar → Get link.",
  FEED_GONE: "Deze agenda bestaat niet meer. Controleer de link.",
  NOT_A_CALENDAR: "Dit lijkt geen agenda-link. Kopieer de link via 'Copy link'.",
  TIMEOUT: "De agenda reageert niet. Probeer later opnieuw.",
};

/**
 * The address an ICS link is fetched from: webcal:// and
 * webcals:// become https://, surrounding spaces go. The
 * rest stays exactly as given: Setmore links end in base64
 * padding ("==") that must not be trimmed or encoded.
 */
export function icsFeedUrl(link) {
  return String(link).trim().replace(/^webcals?:\/\//i, "https://");
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid-url";
  }
}

/**
 * Logs a failed feed request: the status, the domain and the
 * start of the answer. Never the full URL, which holds a
 * secret token.
 */
function logFeedFailure(log, { url, status, body, error }) {
  log?.warn?.(
    {
      domain: hostOf(url),
      status: status ?? null,
      body: body ? body.slice(0, 200) : undefined,
      error: error ?? undefined,
    },
    "ICS feed request failed"
  );
}

/**
 * Downloads an ICS subscription link. The only place that
 * fetches an ICS feed: the check when a link is added and
 * the periodic sync both come here.
 *
 * Valid only with a 2xx status and a body that contains
 * BEGIN:VCALENDAR. Redirects are followed.
 *
 * Returns { text, hash } (hash: to skip unchanged feeds).
 * Throws CalendarFetchError with a Dutch message and a
 * reason code.
 */
export async function fetchIcsFeed(
  link,
  { timeoutMs = ICS_TIMEOUT_MS, log = console } = {}
) {
  const url = icsFeedUrl(link);

  let response;

  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: ICS_REQUEST_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    logFeedFailure(log, { url, error: error?.name ?? "network error" });
    throw new CalendarFetchError(ICS_MESSAGES.TIMEOUT, "TIMEOUT");
  }

  let text;

  try {
    text = await response.text();
  } catch (error) {
    logFeedFailure(log, { url, status: response.status, error: error?.name });
    throw new CalendarFetchError(ICS_MESSAGES.TIMEOUT, "TIMEOUT");
  }

  if (!response.ok) {
    logFeedFailure(log, { url, status: response.status, body: text });

    if (response.status === 401 || response.status === 403) {
      throw new CalendarFetchError(ICS_MESSAGES.LINK_REFUSED, "LINK_REFUSED");
    }

    if (response.status === 404 || response.status === 410) {
      throw new CalendarFetchError(ICS_MESSAGES.FEED_GONE, "FEED_GONE");
    }

    throw new CalendarFetchError(
      `De agenda gaf een fout (status ${response.status}). Probeer later opnieuw.`,
      "UNREACHABLE"
    );
  }

  if (text.length > MAX_ICS_BYTES) {
    logFeedFailure(log, { url, status: response.status, error: "too large" });
    throw new CalendarFetchError("Deze agenda is te groot om in te lezen.", "NOT_A_CALENDAR");
  }

  if (!text.includes("BEGIN:VCALENDAR")) {
    logFeedFailure(log, { url, status: response.status, body: text });
    throw new CalendarFetchError(ICS_MESSAGES.NOT_A_CALENDAR, "NOT_A_CALENDAR");
  }

  return {
    text,
    hash: crypto.createHash("sha256").update(text).digest("hex"),
  };
}
