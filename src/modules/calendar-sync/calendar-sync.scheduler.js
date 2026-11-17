import calendarSyncService from "./calendar-sync.service.js";
import { safeError } from "./calendar-clients.js";
import { env } from "../../config/env.js";

// ======================================================
// Calendar Sync Scheduler
// ======================================================
//
// Runs calendarSyncService.syncAll every few minutes
// (CALENDAR_SYNC_INTERVAL_MINUTES, default 5), never two
// runs at once in this process.
//
// Without CALENDAR_ENCRYPTION_KEY there can be no stored
// connections, so the scheduler does not start.
// ======================================================

let timer = null;
let running = false;

async function run() {
  if (running) {
    return;
  }

  running = true;

  try {
    await calendarSyncService.syncAll();
  } catch (error) {
    console.warn(`[calendar-sync] run failed: ${safeError(error)}`);
  } finally {
    running = false;
  }
}

export function startCalendarSync() {
  if (timer || !env.calendarEncryptionKey) {
    return;
  }

  const intervalMs =
    Math.max(1, env.calendarSyncIntervalMinutes) * 60_000;

  setTimeout(run, 10_000).unref();
  timer = setInterval(run, intervalMs);
  timer.unref();
}
