import calendarSyncRepository from "./calendar-sync.repository.js";
import { parseBusyPeriods } from "./ics-parser.js";
import {
  appointmentFilename,
  appointmentUid,
  buildAppointmentIcs,
  isOwnEventUid,
} from "./appointment-event.js";
import {
  deleteCaldavEvent,
  fetchCaldavEvents,
  fetchIcsFeed,
  listCaldavCalendars,
  putCaldavEvent,
  safeError,
} from "./calendar-clients.js";
import { decryptSecret } from "../../utils/secret-box.js";
import { getUtcRangeForLocalDay } from "../../utils/time.utils.js";
import businessRepository from "../business/business.repository.js";
import AppError from "../../errors/AppError.js";
import NotFoundError from "../../errors/NotFoundError.js";
import { ErrorCodes } from "../../errors/error-codes.js";

// ======================================================
// Calendar Sync Service
// ======================================================
//
// Responsibility
// Mirror a business's external calendars as busy blocks,
// and copy its appointments into its own calendar.
//
// Reading (external calendar = source)
// - syncAll runs every few minutes (calendar-sync.scheduler)
//   and copies the window yesterday .. +120 days.
// - refreshIfStale catches up before availability is shown,
//   for when the server was asleep.
// - checkDayLive re-reads the day of a booking just before
//   it is confirmed. When a calendar cannot be reached, the
//   booking only goes ahead if that calendar was synced in
//   the last 15 minutes.
//
// Writing (our database = source)
// - queueAppointment copies a new, moved or cancelled
//   appointment into the write-target calendar in the
//   background. A failure never fails the booking: the
//   appointment is marked FAILED and retried by syncAll.
//
// Secrets are decrypted only here, right before use, and
// never logged. Errors are stored as short safe messages.
// ======================================================

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const SYNC_PAST_MS = DAY_MS;
const SYNC_FUTURE_MS = 120 * DAY_MS;

// An unchanged calendar (same CTag or feed hash) is still
// re-read after this long, because the window moves on.
const UNCHANGED_RESYNC_MS = 6 * 60 * MINUTE_MS;

const STALE_AFTER_MS = 10 * MINUTE_MS;
const LIVE_CHECK_TRUST_MS = 15 * MINUTE_MS;

const SYNC_TIMEOUT_MS = 15_000;
const STALE_REFRESH_TIMEOUT_MS = 5_000;
const LIVE_CHECK_TIMEOUT_MS = 4_000;
const PUSH_TIMEOUT_MS = 10_000;

function log(message) {
  console.warn(`[calendar-sync] ${message}`);
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => {
        const error = new Error("timeout");
        error.name = "TimeoutError";
        reject(error);
      }, ms).unref()
    ),
  ]);
}

function credentialsFor(connection, timeoutMs) {
  return {
    connectionId: connection.id,
    username: connection.username,
    password: decryptSecret(connection.encryptedSecret),
    timeoutMs,
  };
}

class CalendarSyncService {
  // ----------------------------------------------------
  // Reading
  // ----------------------------------------------------

  /**
   * Fetches one calendar for the window and replaces its
   * blocks there. Returns the number of blocks.
   */
  async #refreshCalendar(
    calendar,
    { fromMs, toMs, timeoutMs, knownCtag }
  ) {
    const connection = calendar.connection;

    let texts;
    let ctag = knownCtag ?? null;

    if (connection.provider === "ICS_FEED") {
      const feed = await fetchIcsFeed(
        decryptSecret(connection.encryptedSecret),
        { timeoutMs }
      );

      texts = [feed.text];
      ctag = feed.hash;
    } else {
      texts = await fetchCaldavEvents(
        credentialsFor(connection, timeoutMs),
        calendar.remoteUrl,
        { fromMs, toMs }
      );
    }

    const blocks = texts.flatMap((text) =>
      parseBusyPeriods(text, {
        fromMs,
        toMs,
        timezone: calendar.business.timezone,
        skipUid: isOwnEventUid,
      })
    );

    await calendarSyncRepository.replaceBlocks(
      calendar,
      new Date(fromMs),
      new Date(toMs),
      blocks
    );

    await calendarSyncRepository.updateCalendar(calendar.id, {
      lastSyncAt: new Date(),
      lastError: null,
      ...(ctag ? { ctag } : {}),
    });

    return blocks.length;
  }

  async #recordError(calendar, error) {
    const message = safeError(error);

    log(`${calendar.displayName} (${calendar.id}): ${message}`);

    await calendarSyncRepository
      .updateCalendar(calendar.id, { lastError: message })
      .catch(() => {});
  }

  /**
   * Syncs the given calendars for the full window.
   * Unchanged calendars (same CTag or feed hash, synced
   * recently) are skipped. Never throws.
   *
   * Returns [{ calendarId, displayName, blocks?, skipped?,
   *            error? }].
   */
  async #syncCalendars(calendars, { timeoutMs }) {
    const nowMs = Date.now();
    const fromMs = nowMs - SYNC_PAST_MS;
    const toMs = nowMs + SYNC_FUTURE_MS;

    // CTags per CalDAV connection: one request tells which
    // calendars changed.
    const ctags = new Map();

    for (const calendar of calendars) {
      const connection = calendar.connection;

      if (
        connection.provider !== "ICLOUD_CALDAV" ||
        ctags.has(connection.id)
      ) {
        continue;
      }

      try {
        const remote = await listCaldavCalendars(
          credentialsFor(connection, timeoutMs)
        );

        ctags.set(
          connection.id,
          new Map(remote.map((item) => [item.url, item.ctag]))
        );
      } catch (error) {
        ctags.set(connection.id, new Map());
        log(`connection ${connection.id}: ${safeError(error)}`);
      }
    }

    const results = [];

    for (const calendar of calendars) {
      const remoteCtag = ctags
        .get(calendar.connection.id)
        ?.get(calendar.remoteUrl);

      const recentlySynced =
        calendar.lastSyncAt &&
        nowMs - calendar.lastSyncAt.getTime() < UNCHANGED_RESYNC_MS;

      if (
        remoteCtag &&
        remoteCtag === calendar.ctag &&
        recentlySynced &&
        !calendar.lastError
      ) {
        await calendarSyncRepository.updateCalendar(calendar.id, {
          lastSyncAt: new Date(),
        });

        results.push({
          calendarId: calendar.id,
          displayName: calendar.displayName,
          skipped: true,
        });

        continue;
      }

      try {
        const blocks = await this.#refreshCalendar(calendar, {
          fromMs,
          toMs,
          timeoutMs,
          knownCtag: remoteCtag,
        });

        results.push({
          calendarId: calendar.id,
          displayName: calendar.displayName,
          blocks,
        });
      } catch (error) {
        await this.#recordError(calendar, error);

        results.push({
          calendarId: calendar.id,
          displayName: calendar.displayName,
          error: safeError(error),
        });
      }
    }

    return results;
  }

  /**
   * The periodic job: every active calendar of every
   * business, then the appointments still to be copied.
   */
  async syncAll() {
    const calendars = await calendarSyncRepository.findActiveCalendars();

    const results = await this.#syncCalendars(calendars, {
      timeoutMs: SYNC_TIMEOUT_MS,
    });

    await this.pushPending();

    await calendarSyncRepository.deleteBlocksEndedBefore(
      new Date(Date.now() - 2 * DAY_MS)
    );

    return results;
  }

  /**
   * One business, now (setup script, manual refresh).
   */
  async syncBusiness(businessId) {
    const calendars =
      await calendarSyncRepository.findActiveCalendars(businessId);

    return this.#syncCalendars(
      calendars.map((calendar) => ({ ...calendar, ctag: null })),
      { timeoutMs: SYNC_TIMEOUT_MS }
    );
  }

  /**
   * Catches up calendars that were not synced in the last
   * 10 minutes (server was asleep). Waits at most a few
   * seconds; availability then uses what is there.
   */
  async refreshIfStale(businessId) {
    const calendars =
      await calendarSyncRepository.findActiveCalendars(businessId);

    const stale = calendars.filter(
      (calendar) =>
        !calendar.lastSyncAt ||
        Date.now() - calendar.lastSyncAt.getTime() > STALE_AFTER_MS
    );

    if (stale.length === 0) {
      return;
    }

    await withTimeout(
      this.#syncCalendars(stale, {
        timeoutMs: STALE_REFRESH_TIMEOUT_MS,
      }),
      STALE_REFRESH_TIMEOUT_MS + 1_000
    ).catch((error) => log(`refreshIfStale: ${safeError(error)}`));
  }

  /**
   * Re-reads every calendar of the business for one local
   * day, right before a booking on that day is confirmed.
   * The booking then re-checks availability against the
   * fresh blocks.
   *
   * Throws CALENDAR_UNAVAILABLE when a calendar cannot be
   * reached and its last sync is older than 15 minutes.
   */
  async checkDayLive(business, date) {
    const calendars =
      await calendarSyncRepository.findActiveCalendars(business.id);

    if (calendars.length === 0) {
      return;
    }

    const day = getUtcRangeForLocalDay(date, business.timezone);

    // The day before too: a long block (or travel time)
    // can run into the morning.
    const fromMs = day.start.getTime() - DAY_MS;
    const toMs = day.end.getTime();

    const outcomes = await Promise.all(
      calendars.map(async (calendar) => {
        try {
          await withTimeout(
            this.#refreshCalendar(calendar, {
              fromMs,
              toMs,
              timeoutMs: LIVE_CHECK_TIMEOUT_MS,
            }),
            LIVE_CHECK_TIMEOUT_MS + 1_000
          );

          return true;
        } catch (error) {
          await this.#recordError(calendar, error);

          return (
            calendar.lastSyncAt &&
            Date.now() - calendar.lastSyncAt.getTime() <
              LIVE_CHECK_TRUST_MS
          );
        }
      })
    );

    if (outcomes.includes(false)) {
      const error = new AppError(
        "The calendar cannot be checked right now. Please try again in a moment.",
        503
      );

      error.code = ErrorCodes.CALENDAR_UNAVAILABLE;

      throw error;
    }
  }

  // ----------------------------------------------------
  // Writing
  // ----------------------------------------------------

  /**
   * Copies an appointment into the business's calendar in
   * the background. Never throws.
   */
  queueAppointment(appointmentId) {
    this.pushAppointment(appointmentId).catch((error) =>
      log(`push ${appointmentId}: ${safeError(error)}`)
    );
  }

  /**
   * Writes, updates or removes the calendar copy of one
   * appointment. Returns the resulting status, or null when
   * the business has no calendar to write into.
   */
  async pushAppointment(appointmentId) {
    const appointment =
      await calendarSyncRepository.findAppointment(appointmentId);

    if (!appointment) {
      return null;
    }

    const target = await calendarSyncRepository.findWriteTarget(
      appointment.businessId
    );

    if (!target) {
      return null;
    }

    await calendarSyncRepository.updateAppointmentCopy(appointment.id, {
      externalSyncStatus: "PENDING",
    });

    try {
      const credentials = credentialsFor(
        target.connection,
        PUSH_TIMEOUT_MS
      );

      if (appointment.status === "CANCELLED") {
        if (appointment.externalEventUrl) {
          await deleteCaldavEvent(
            credentials,
            appointment.externalEventUrl
          );
        }

        await calendarSyncRepository.updateAppointmentCopy(
          appointment.id,
          {
            externalSyncStatus: "SYNCED",
            externalSyncError: null,
            externalEventUrl: null,
            externalEventEtag: null,
          }
        );

        return "SYNCED";
      }

      const written = await putCaldavEvent(credentials, {
        calendarUrl: target.remoteUrl,
        eventUrl: appointment.externalEventUrl,
        filename: appointmentFilename(appointment.id),
        icsText: buildAppointmentIcs(appointment),
      });

      await calendarSyncRepository.updateAppointmentCopy(appointment.id, {
        externalEventUid: appointmentUid(appointment.id),
        externalEventUrl: written.url,
        externalEventEtag: written.etag,
        externalSyncStatus: "SYNCED",
        externalSyncError: null,
      });

      return "SYNCED";
    } catch (error) {
      await calendarSyncRepository.updateAppointmentCopy(appointment.id, {
        externalSyncStatus: "FAILED",
        externalSyncError: safeError(error),
      });

      return "FAILED";
    }
  }

  async pushPending() {
    const appointments =
      await calendarSyncRepository.findAppointmentsToPush();

    for (const appointment of appointments) {
      await this.pushAppointment(appointment.id).catch((error) =>
        log(`push ${appointment.id}: ${safeError(error)}`)
      );
    }
  }

  // ----------------------------------------------------
  // Showing
  // ----------------------------------------------------

  /**
   * Busy blocks of one local day, for the agenda in the
   * app. Times only, with the calendar's name.
   */
  async listBusyForDay(businessId, date) {
    const business = await businessRepository.findById(businessId);

    if (!business) {
      throw new NotFoundError(
        "Business not found.",
        ErrorCodes.BUSINESS_NOT_FOUND
      );
    }

    const day = getUtcRangeForLocalDay(date, business.timezone);

    const blocks = await calendarSyncRepository.findBlocksOverlapping(
      business.id,
      day.start,
      day.end
    );

    return blocks.map((block) => ({
      id: block.id,
      startTime: block.startTime.toISOString(),
      endTime: block.endTime.toISOString(),
      allDay: block.allDay,
      calendarName: block.calendar.displayName,
      therapistId: block.calendar.therapistId,
    }));
  }
}

export default new CalendarSyncService();
