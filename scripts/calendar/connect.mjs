// ======================================================
// Calendar connections: setup and checks
// ======================================================
//
// Connects a business's own calendars (iCloud via CalDAV,
// a Setmore/other ICS link) as busy time, and picks the
// calendar new appointments are written into.
//
// Calendars are always chosen by their CalDAV URL (shown by
// "list"), never by name. Secrets are stored encrypted and
// never printed.
//
//   node scripts/calendar/connect.mjs list
//       Calendars of the iCloud account in .env
//       (ICLOUD_USERNAME / ICLOUD_APP_PASSWORD).
//
//   node scripts/calendar/connect.mjs icloud --business <id|slug>
//       --read <url> [--read <url> ...] [--write <url>]
//       [--travel <url>=<minutes>] [--therapist <url>=<therapistId>]
//       [--username <appleId>]   (default: ICLOUD_USERNAME;
//                                 password from ICLOUD_APP_PASSWORD)
//       A --write calendar is read too.
//
//   ICS_URL='webcal://...' node scripts/calendar/connect.mjs ics
//       --business <id|slug> --name "The Bridge Lanaken" [--travel 30]
//       The link comes from ICS_URL so it does not end up
//       in your shell history.
//
//   node scripts/calendar/connect.mjs status --business <id|slug>
//   node scripts/calendar/connect.mjs sync   --business <id|slug>
//   node scripts/calendar/connect.mjs busy   --business <id|slug> --date 2026-11-18
//   node scripts/calendar/connect.mjs push   --appointment <id>
//   node scripts/calendar/connect.mjs disable --calendar <externalCalendarId>
// ======================================================

import "dotenv/config";
import { parseArgs } from "node:util";
import prisma from "../../src/db/prisma.js";
import { encryptSecret } from "../../src/utils/secret-box.js";
import { listCaldavCalendars } from "../../src/modules/calendar-sync/calendar-clients.js";
import calendarSyncService from "../../src/modules/calendar-sync/calendar-sync.service.js";
import calendarSyncRepository from "../../src/modules/calendar-sync/calendar-sync.repository.js";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    business: { type: "string" },
    read: { type: "string", multiple: true, default: [] },
    write: { type: "string" },
    travel: { type: "string", multiple: true, default: [] },
    therapist: { type: "string", multiple: true, default: [] },
    username: { type: "string" },
    name: { type: "string" },
    date: { type: "string" },
    appointment: { type: "string" },
    calendar: { type: "string" },
  },
});

const command = positionals[0];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function envCredentials(username) {
  const user = username ?? process.env.ICLOUD_USERNAME;
  const password = process.env.ICLOUD_APP_PASSWORD;

  if (!user || !password) {
    fail("Set ICLOUD_USERNAME and ICLOUD_APP_PASSWORD in .env first.");
  }

  return { connectionId: "setup", username: user, password, timeoutMs: 20_000 };
}

async function findBusiness() {
  if (!values.business) {
    fail("Pass --business <id or slug>.");
  }

  const business = await prisma.business.findFirst({
    where: { OR: [{ id: values.business }, { slug: values.business }] },
  });

  if (!business) {
    fail(`No business ${values.business}.`);
  }

  return business;
}

// "<url>=<value>" pairs; the URL itself contains no "=" at the end.
function pairs(list) {
  return new Map(
    list.map((item) => {
      const at = item.lastIndexOf("=");
      return [normalize(item.slice(0, at)), item.slice(at + 1)];
    })
  );
}

const normalize = (url) => url.replace(/\/?$/, "/");

async function list() {
  const calendars = await listCaldavCalendars(envCredentials(values.username));

  console.log(`${calendars.length} calendars:\n`);

  for (const calendar of calendars) {
    console.log(`${calendar.displayName}\n  ${calendar.url}\n`);
  }
}

async function connectIcloud() {
  const business = await findBusiness();
  const credentials = envCredentials(values.username);

  const readUrls = values.read.map(normalize);
  const writeUrl = values.write ? normalize(values.write) : null;
  const urls = [...new Set([...readUrls, ...(writeUrl ? [writeUrl] : [])])];

  if (urls.length === 0) {
    fail("Pass at least one --read or --write calendar URL (see list).");
  }

  // Check the login and that every URL exists, with its name.
  const remote = new Map(
    (await listCaldavCalendars(credentials)).map((calendar) => [calendar.url, calendar])
  );

  for (const url of urls) {
    if (!remote.has(url)) {
      fail(`Calendar not found in this account: ${url}`);
    }
  }

  const travel = pairs(values.travel);
  const therapists = pairs(values.therapist);

  // One connection per Apple ID per business: running this
  // again adds calendars and refreshes the password.
  const existing = await prisma.calendarConnection.findFirst({
    where: {
      businessId: business.id,
      provider: "ICLOUD_CALDAV",
      username: credentials.username,
    },
  });

  const connection = existing
    ? await prisma.calendarConnection.update({
        where: { id: existing.id },
        data: { encryptedSecret: encryptSecret(credentials.password), isActive: true },
      })
    : await prisma.calendarConnection.create({
        data: {
          businessId: business.id,
          provider: "ICLOUD_CALDAV",
          username: credentials.username,
          encryptedSecret: encryptSecret(credentials.password),
        },
      });

  if (writeUrl) {
    await calendarSyncRepository.clearWriteTargets(business.id);
  }

  for (const url of urls) {
    await calendarSyncRepository.upsertCalendar({
      businessId: business.id,
      connectionId: connection.id,
      remoteUrl: url,
      displayName: remote.get(url).displayName,
      isWriteTarget: url === writeUrl,
      travelMinutes: Number(travel.get(url) ?? 0),
      therapistId: therapists.get(url) ?? null,
    });
  }

  console.log(`Connected ${urls.length} iCloud calendar(s) to ${business.name}.`);
  await status(business);
}

async function connectIcs() {
  const business = await findBusiness();
  const link = process.env.ICS_URL;

  if (!link) {
    fail("Put the link in ICS_URL: ICS_URL='webcal://...' node scripts/calendar/connect.mjs ics ...");
  }

  if (!values.name) {
    fail('Pass --name "The Bridge Lanaken".');
  }

  const connection = await prisma.calendarConnection.create({
    data: {
      businessId: business.id,
      provider: "ICS_FEED",
      encryptedSecret: encryptSecret(link),
    },
  });

  await calendarSyncRepository.upsertCalendar({
    businessId: business.id,
    connectionId: connection.id,
    remoteUrl: `ics:${connection.id}`,
    displayName: values.name,
    travelMinutes: Number(values.travel?.[0] ?? 0),
  });

  console.log(`Connected ICS feed "${values.name}" to ${business.name}.`);
  await status(business);
}

async function status(known) {
  const business = known ?? (await findBusiness());
  const calendars = await calendarSyncRepository.findCalendarsForBusiness(business.id);

  console.log(`\n${business.name}: ${calendars.length} calendar(s)\n`);

  for (const calendar of calendars) {
    const blocks = await prisma.externalBusyBlock.count({
      where: { calendarId: calendar.id },
    });

    console.log(
      [
        `${calendar.isActive ? "●" : "○"} ${calendar.displayName}  [${calendar.connection.provider}]`,
        `  id ${calendar.id}`,
        calendar.connection.provider === "ICLOUD_CALDAV" ? `  url ${calendar.remoteUrl}` : null,
        `  ${calendar.isWriteTarget ? "read + WRITE" : "read only"}` +
          (calendar.travelMinutes ? `, travel ${calendar.travelMinutes} min` : "") +
          (calendar.therapistId ? `, therapist ${calendar.therapistId}` : ", whole business"),
        `  last sync ${calendar.lastSyncAt?.toISOString() ?? "never"}, ${blocks} blocks` +
          (calendar.lastError ? `, ERROR: ${calendar.lastError}` : ""),
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
}

async function sync() {
  const business = await findBusiness();
  const results = await calendarSyncService.syncBusiness(business.id);

  for (const result of results) {
    console.log(
      `${result.displayName}: ` +
        (result.error ? `ERROR ${result.error}` : `${result.blocks} blocks`)
    );
  }

  await calendarSyncService.pushPending();
}

async function busy() {
  const business = await findBusiness();

  if (!values.date) {
    fail("Pass --date YYYY-MM-DD.");
  }

  const blocks = await calendarSyncService.listBusyForDay(business.id, values.date);
  const time = (iso) =>
    new Date(iso).toLocaleTimeString("nl-BE", {
      timeZone: business.timezone,
      hour: "2-digit",
      minute: "2-digit",
    });

  for (const block of blocks) {
    console.log(
      `${block.allDay ? "hele dag  " : `${time(block.startTime)}-${time(block.endTime)}`}  ${block.calendarName}`
    );
  }

  if (blocks.length === 0) {
    console.log("No busy blocks.");
  }
}

async function push() {
  if (!values.appointment) {
    fail("Pass --appointment <id>.");
  }

  const result = await calendarSyncService.pushAppointment(values.appointment);
  const appointment = await prisma.appointment.findUnique({
    where: { id: values.appointment },
    select: { externalSyncStatus: true, externalSyncError: true, externalEventUrl: true },
  });

  console.log(result ?? "No write calendar for this business.", appointment);
}

async function disable() {
  if (!values.calendar) {
    fail("Pass --calendar <externalCalendarId>.");
  }

  await calendarSyncRepository.updateCalendar(values.calendar, {
    isActive: false,
    isWriteTarget: false,
  });

  await prisma.externalBusyBlock.deleteMany({ where: { calendarId: values.calendar } });

  console.log("Calendar disabled and its busy blocks removed.");
}

const commands = {
  list,
  icloud: connectIcloud,
  ics: connectIcs,
  status: () => status(),
  sync,
  busy,
  push,
  disable,
};

if (!commands[command]) {
  fail(`Usage: node scripts/calendar/connect.mjs <${Object.keys(commands).join("|")}> ...`);
}

try {
  await commands[command]();
} catch (error) {
  // Messages from the calendar code are already safe.
  fail(`Failed: ${error.message}`);
} finally {
  await prisma.$disconnect();
}
