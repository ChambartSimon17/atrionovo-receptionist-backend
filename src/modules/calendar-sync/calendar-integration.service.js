import prisma from "../../db/prisma.js";
import calendarSyncRepository from "./calendar-sync.repository.js";
import calendarSyncService from "./calendar-sync.service.js";
import {
  CalendarFetchError,
  fetchIcsFeed,
  forgetCaldavClient,
  listCaldavCalendars,
  safeError,
} from "./calendar-clients.js";
import { decryptSecret, encryptSecret } from "../../utils/secret-box.js";
import AppError from "../../errors/AppError.js";
import NotFoundError from "../../errors/NotFoundError.js";
import { ErrorCodes } from "../../errors/error-codes.js";

// ======================================================
// Calendar Integration Service
// ======================================================
//
// Responsibility
// Let a business owner connect their own calendars from
// the app (Meer → Integraties), instead of the setup
// script:
//
// - an iCloud account (Apple ID + app-specific password):
//   pick which calendars count as busy time, and the one
//   new appointments are written into;
// - an ICS link (Setmore and others): read only.
//
// Nothing is connected for a new business: integrations
// exist only when the owner adds them.
//
// The password and the ICS link are checked against the
// real server before they are stored, are stored
// encrypted, and are never sent back to the app or logged.
// ======================================================

const SETUP_TIMEOUT_MS = 15_000;

// A short reason the app turns into a Dutch explanation.
function failureReason(message) {
  if (/login refused/i.test(message)) return "LOGIN_REFUSED";
  if (/timeout/i.test(message)) return "TIMEOUT";
  if (/not a calendar|too large/i.test(message)) return "NOT_A_CALENDAR";
  if (/valid link|https or webcal/i.test(message)) return "INVALID_LINK";
  if (/no longer exists/i.test(message)) return "CALENDAR_GONE";
  return "UNREACHABLE";
}

function connectError(error) {
  const message = safeError(error);
  const failure = new AppError(message, 422);
  failure.code = ErrorCodes.CALENDAR_CONNECT_FAILED;
  failure.details = [{ reason: failureReason(message) }];
  return failure;
}

const normalizeUrl = (url) => url.replace(/\/?$/, "/");

/**
 * The ICS link as it will be fetched. Only public https
 * addresses: the server must not be pointed at itself or
 * the internal network.
 */
function checkIcsLink(link) {
  const trimmed = link.trim().replace(/^webcals?:\/\//i, "https://");

  let url;

  try {
    url = new URL(trimmed);
  } catch {
    throw connectError(new CalendarFetchError("This is not a valid link."));
  }

  const host = url.hostname.toLowerCase();

  const isPrivateHost =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    /^[\d.]+$/.test(host) ||
    host.includes(":") ||
    host.startsWith("[");

  if (url.protocol !== "https:" || isPrivateHost) {
    throw connectError(
      new CalendarFetchError(
        "Use the https or webcal link of the calendar."
      )
    );
  }

  return trimmed;
}

/**
 * What the app may see of a calendar: never the secret,
 * and the address only for iCloud calendars (an ICS link
 * is itself the secret).
 */
function publicCalendar(calendar, blockCounts) {
  return {
    id: calendar.id,
    displayName: calendar.displayName,
    remoteUrl:
      calendar.connection?.provider === "ICS_FEED" ? null : calendar.remoteUrl,
    isActive: calendar.isActive,
    isWriteTarget: calendar.isWriteTarget,
    travelMinutes: calendar.travelMinutes,
    // Empty: busy for the whole business. Set: only for
    // that therapist.
    therapistId: calendar.therapistId ?? null,
    lastSyncAt: calendar.lastSyncAt,
    lastError: calendar.lastError,
    blockCount: blockCounts.get(calendar.id) ?? 0,
  };
}

class CalendarIntegrationService {
  async #findConnection(businessId, connectionId) {
    const connection = await prisma.calendarConnection.findFirst({
      where: { id: connectionId, businessId },
    });

    if (!connection) {
      throw new NotFoundError(
        "Calendar connection not found.",
        ErrorCodes.CALENDAR_CONNECTION_NOT_FOUND
      );
    }

    return connection;
  }

  /**
   * The therapists must belong to this business.
   */
  async #checkTherapists(businessId, ids) {
    const wanted = [...new Set(ids.filter(Boolean))];

    if (wanted.length === 0) {
      return;
    }

    const found = await prisma.therapist.count({
      where: { businessId, id: { in: wanted } },
    });

    if (found !== wanted.length) {
      throw new NotFoundError(
        "Therapist not found.",
        ErrorCodes.THERAPIST_NOT_FOUND
      );
    }
  }

  #credentials(connection, password) {
    return {
      // A fresh login for checks: never a cached client.
      connectionId: `check-${connection?.id ?? "new"}-${Date.now()}`,
      username: connection?.username,
      password: password ?? decryptSecret(connection.encryptedSecret),
      timeoutMs: SETUP_TIMEOUT_MS,
    };
  }

  /**
   * The account's calendars, with a one-off login that is
   * not kept: a wrong password must never pass on a
   * cached session.
   */
  async #listRemote(connection, password) {
    const credentials = this.#credentials(connection, password);

    try {
      return await listCaldavCalendars(credentials);
    } catch (error) {
      throw connectError(error);
    } finally {
      forgetCaldavClient(credentials.connectionId);
    }
  }

  /**
   * Every connection of the business with its calendars.
   */
  async list(businessId) {
    const [connections, counts] = await Promise.all([
      prisma.calendarConnection.findMany({
        where: { businessId },
        include: {
          calendars: {
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.externalBusyBlock.groupBy({
        by: ["calendarId"],
        where: { businessId, endTime: { gt: new Date() } },
        _count: { _all: true },
      }),
    ]);

    const blockCounts = new Map(
      counts.map((row) => [row.calendarId, row._count._all])
    );

    return connections.map((connection) => ({
      id: connection.id,
      provider: connection.provider,
      username: connection.username,
      isActive: connection.isActive,
      createdAt: connection.createdAt,
      calendars: connection.calendars
        .filter(
          (calendar) =>
            calendar.isActive || connection.provider === "ICS_FEED"
        )
        .map((calendar) =>
          publicCalendar({ ...calendar, connection }, blockCounts)
        ),
    }));
  }

  /**
   * Checks the Apple ID and app-specific password against
   * iCloud, then stores them (one connection per Apple ID:
   * connecting again refreshes the password).
   *
   * Returns the connection and the account's calendars.
   */
  async connectIcloud(businessId, { username, password }) {
    const remote = await this.#listRemote({ username }, password);

    const existing = await prisma.calendarConnection.findFirst({
      where: { businessId, provider: "ICLOUD_CALDAV", username },
    });

    const connection = existing
      ? await prisma.calendarConnection.update({
          where: { id: existing.id },
          data: { encryptedSecret: encryptSecret(password), isActive: true },
        })
      : await prisma.calendarConnection.create({
          data: {
            businessId,
            provider: "ICLOUD_CALDAV",
            username,
            encryptedSecret: encryptSecret(password),
          },
        });

    forgetCaldavClient(connection.id);

    return {
      connectionId: connection.id,
      calendars: await this.#withSettings(connection, remote),
    };
  }

  /**
   * The calendars of a connected iCloud account, with how
   * each is used now (for the picker).
   */
  async remoteCalendars(businessId, connectionId) {
    const connection = await this.#findConnection(businessId, connectionId);

    if (connection.provider !== "ICLOUD_CALDAV") {
      throw new NotFoundError(
        "Calendar connection not found.",
        ErrorCodes.CALENDAR_CONNECTION_NOT_FOUND
      );
    }

    const remote = await this.#listRemote(connection);

    return this.#withSettings(connection, remote);
  }

  async #withSettings(connection, remote) {
    const stored = await prisma.externalCalendar.findMany({
      where: { connectionId: connection.id },
    });

    const byUrl = new Map(stored.map((calendar) => [calendar.remoteUrl, calendar]));

    return remote.map((calendar) => {
      const current = byUrl.get(calendar.url);

      return {
        remoteUrl: calendar.url,
        displayName: calendar.displayName,
        read: Boolean(current?.isActive),
        write: Boolean(current?.isActive && current?.isWriteTarget),
        travelMinutes: current?.travelMinutes ?? 0,
        therapistId: current?.therapistId ?? null,
      };
    });
  }

  /**
   * Saves which calendars of an iCloud account count as
   * busy time and which one gets new appointments, then
   * syncs them.
   *
   * calendars: [{ remoteUrl, read, travelMinutes, therapistId }]
   * writeUrl:  remote URL of the write calendar, or null.
   */
  async saveIcloudCalendars(businessId, connectionId, { calendars, writeUrl }) {
    const connection = await this.#findConnection(businessId, connectionId);

    await this.#checkTherapists(
      businessId,
      calendars.map((calendar) => calendar.therapistId)
    );

    const remote = await this.#listRemote(connection);

    const names = new Map(remote.map((calendar) => [calendar.url, calendar.displayName]));

    const write = writeUrl ? normalizeUrl(writeUrl) : null;

    const chosen = calendars.map((calendar) => ({
      ...calendar,
      remoteUrl: normalizeUrl(calendar.remoteUrl),
    }));

    for (const calendar of chosen) {
      if (!names.has(calendar.remoteUrl)) {
        throw connectError(
          new CalendarFetchError("A chosen calendar no longer exists in this account.")
        );
      }
    }

    if (write && !names.has(write)) {
      throw connectError(
        new CalendarFetchError("The calendar for new appointments no longer exists.")
      );
    }

    const active = new Set(
      chosen.filter((calendar) => calendar.read).map((calendar) => calendar.remoteUrl)
    );

    // The write calendar is always read too: its other
    // events are busy time as well.
    if (write) {
      active.add(write);
    }

    const travel = new Map(
      chosen.map((calendar) => [calendar.remoteUrl, calendar.travelMinutes ?? 0])
    );

    const owners = new Map(
      chosen.map((calendar) => [calendar.remoteUrl, calendar.therapistId ?? null])
    );

    await prisma.$transaction(async (tx) => {
      if (write) {
        await tx.externalCalendar.updateMany({
          where: { businessId },
          data: { isWriteTarget: false },
        });
      } else {
        await tx.externalCalendar.updateMany({
          where: { connectionId: connection.id },
          data: { isWriteTarget: false },
        });
      }

      const stored = await tx.externalCalendar.findMany({
        where: { connectionId: connection.id },
      });

      // Switched off: stop reading and drop its busy time.
      for (const calendar of stored) {
        if (!active.has(calendar.remoteUrl) && calendar.isActive) {
          await tx.externalCalendar.update({
            where: { id: calendar.id },
            data: { isActive: false, isWriteTarget: false, ctag: null },
          });

          await tx.externalBusyBlock.deleteMany({
            where: { calendarId: calendar.id },
          });
        }
      }

      for (const url of active) {
        const data = {
          businessId,
          connectionId: connection.id,
          remoteUrl: url,
          displayName: names.get(url),
          isActive: true,
          isWriteTarget: url === write,
          travelMinutes: travel.get(url) ?? 0,
          therapistId: owners.get(url) ?? null,
        };

        await tx.externalCalendar.upsert({
          where: {
            connectionId_remoteUrl: {
              connectionId: connection.id,
              remoteUrl: url,
            },
          },
          create: data,
          update: { ...data, ctag: null },
        });
      }
    });

    return this.#syncAndList(businessId);
  }

  /**
   * Adds an ICS link (Setmore and others) as busy time,
   * after checking that it really is a calendar.
   */
  async connectIcs(businessId, { name, url, travelMinutes, therapistId }) {
    const link = checkIcsLink(url);

    await this.#checkTherapists(businessId, [therapistId]);

    try {
      await fetchIcsFeed(link, { timeoutMs: SETUP_TIMEOUT_MS });
    } catch (error) {
      throw connectError(error);
    }

    await prisma.$transaction(async (tx) => {
      const connection = await tx.calendarConnection.create({
        data: {
          businessId,
          provider: "ICS_FEED",
          encryptedSecret: encryptSecret(link),
        },
      });

      await tx.externalCalendar.create({
        data: {
          businessId,
          connectionId: connection.id,
          remoteUrl: `ics:${connection.id}`,
          displayName: name,
          travelMinutes: travelMinutes ?? 0,
          therapistId: therapistId ?? null,
        },
      });
    });

    return this.#syncAndList(businessId);
  }

  /**
   * Name (ICS only), travel time, therapist, or on/off
   * of one calendar.
   */
  async updateCalendar(businessId, calendarId, changes) {
    const calendar = await prisma.externalCalendar.findFirst({
      where: { id: calendarId, businessId },
      include: { connection: true },
    });

    if (!calendar) {
      throw new NotFoundError(
        "Calendar not found.",
        ErrorCodes.CALENDAR_CONNECTION_NOT_FOUND
      );
    }

    const data = {};

    if (changes.travelMinutes !== undefined) {
      data.travelMinutes = changes.travelMinutes;
    }

    if (changes.therapistId !== undefined) {
      await this.#checkTherapists(businessId, [changes.therapistId]);
      data.therapistId = changes.therapistId;
    }

    if (
      changes.displayName !== undefined &&
      calendar.connection.provider === "ICS_FEED"
    ) {
      data.displayName = changes.displayName;
    }

    if (changes.isActive !== undefined) {
      data.isActive = changes.isActive;

      if (!changes.isActive) {
        data.isWriteTarget = false;
        data.ctag = null;
      }
    }

    await calendarSyncRepository.updateCalendar(calendar.id, data);

    if (changes.isActive === false) {
      await prisma.externalBusyBlock.deleteMany({
        where: { calendarId: calendar.id },
      });
    }

    return this.#syncAndList(businessId);
  }

  /**
   * Removes a connection: its calendars, busy time and
   * stored password or link. Appointments already copied
   * into iCloud stay there.
   */
  async disconnect(businessId, connectionId) {
    const connection = await this.#findConnection(businessId, connectionId);

    await prisma.calendarConnection.delete({ where: { id: connection.id } });

    forgetCaldavClient(connection.id);

    return this.list(businessId);
  }

  async sync(businessId) {
    return this.#syncAndList(businessId);
  }

  async #syncAndList(businessId) {
    await calendarSyncService.syncBusiness(businessId);

    return this.list(businessId);
  }
}

export default new CalendarIntegrationService();
