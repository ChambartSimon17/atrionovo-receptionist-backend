import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  CalendarFetchError,
  ICS_REQUEST_HEADERS,
  fetchIcsFeed,
  icsFeedUrl,
} from "../src/modules/calendar-sync/calendar-clients.js";

// A Setmore-style link: the token ends in base64 padding.
const LINK =
  "https://my.setmore.com/calendar/feed/abcDEF123+/xyz_TOKEN==";

const FEED = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";

const realFetch = globalThis.fetch;
const quiet = { warn() {} };

afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(respond) {
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };

  return calls;
}

test("sends the calendar-app headers and keeps the URL exactly", async () => {
  const calls = stubFetch(() => new Response(FEED, { status: 200 }));

  const feed = await fetchIcsFeed(LINK, { log: quiet });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, LINK);
  assert.ok(calls[0].url.endsWith("=="));
  assert.equal(calls[0].init.headers["User-Agent"], "macOS/15.0 (24A335) CalendarAgent/1000");
  assert.equal(calls[0].init.headers.Accept, "text/calendar, */*;q=0.8");
  assert.deepEqual(calls[0].init.headers, ICS_REQUEST_HEADERS);
  assert.equal(calls[0].init.redirect, "follow");
  assert.ok(calls[0].init.signal);
  assert.equal(feed.text, FEED);
});

test("webcal:// becomes https://, nothing else changes", () => {
  assert.equal(
    icsFeedUrl("webcal://my.setmore.com/calendar/feed/xyz_TOKEN=="),
    "https://my.setmore.com/calendar/feed/xyz_TOKEN=="
  );
  assert.equal(
    icsFeedUrl("  webcals://my.setmore.com/calendar/feed/xyz_TOKEN==\n"),
    "https://my.setmore.com/calendar/feed/xyz_TOKEN=="
  );
  assert.equal(icsFeedUrl(LINK), LINK);
  assert.ok(!icsFeedUrl(LINK).includes("%3D"));
});

async function failureOf(status, body) {
  stubFetch(() => new Response(body, { status }));

  try {
    await fetchIcsFeed(LINK, { log: quiet });
  } catch (error) {
    assert.ok(error instanceof CalendarFetchError);
    return error;
  }

  assert.fail("expected a CalendarFetchError");
}

test("401 and 403: link expired or refused", async () => {
  const setmore =
    '{"response":false,"error":"unauthorized_request","msg":"Your access token has been deemed invalid or expired","code":401}';

  for (const status of [401, 403]) {
    const error = await failureOf(status, setmore);

    assert.equal(error.reason, "LINK_REFUSED");
    assert.match(error.message, /Settings → My Profile → Calendar → Get link/);
  }
});

test("404 and 410: calendar no longer exists", async () => {
  for (const status of [404, 410]) {
    const error = await failureOf(status, "Not found");

    assert.equal(error.reason, "FEED_GONE");
    assert.equal(error.message, "Deze agenda bestaat niet meer. Controleer de link.");
  }
});

test("2xx without iCal content is not a calendar", async () => {
  const error = await failureOf(200, "<html>Login</html>");

  assert.equal(error.reason, "NOT_A_CALENDAR");
  assert.equal(error.message, "Dit lijkt geen agenda-link. Kopieer de link via 'Copy link'.");
});

test("timeout or network error: the calendar does not answer", async () => {
  globalThis.fetch = async () => {
    throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
  };

  await assert.rejects(fetchIcsFeed(LINK, { log: quiet }), (error) => {
    assert.equal(error.reason, "TIMEOUT");
    assert.equal(error.message, "De agenda reageert niet. Probeer later opnieuw.");
    return true;
  });
});

test("logs status, domain and the start of the answer, never the URL", async () => {
  const logged = [];
  const log = { warn: (data, message) => logged.push({ data, message }) };
  const body = "x".repeat(500);

  stubFetch(() => new Response(body, { status: 401 }));

  await assert.rejects(fetchIcsFeed(LINK, { log }));

  assert.equal(logged.length, 1);
  assert.equal(logged[0].data.status, 401);
  assert.equal(logged[0].data.domain, "my.setmore.com");
  assert.equal(logged[0].data.body.length, 200);
  assert.ok(!JSON.stringify(logged).includes("xyz_TOKEN"));
});
