import bcrypt from "bcryptjs";
import { DateTime } from "luxon";

import prisma from "../../db/prisma.js";
import businessRepository from "../business/business.repository.js";
import { addDays, toDbDate } from "../therapist/schedule.js";
import { therapistDay } from "./team-schedule.service.js";
import AppError from "../../errors/AppError.js";
import ConflictError from "../../errors/ConflictError.js";
import NotFoundError from "../../errors/NotFoundError.js";
import ValidationError from "../../errors/ValidationError.js";
import { ErrorCodes } from "../../errors/error-codes.js";
import { getUtcRangeForLocalDay } from "../../utils/time.utils.js";

// ======================================================
// Time Clock
// ======================================================
//
// A device at the counter runs the time clock. A
// therapist types their name, enters their PIN and takes
// a selfie.
//
// In or out is decided by the last entry: a therapist
// with an open entry clocks out, everyone else clocks in.
// An entry that is still open after 16 hours was a
// forgotten clock-out: it stays open for the owner to
// correct, and the therapist clocks in again.
//
// PINs: 4 digits, chosen by the therapist, stored as a
// bcrypt hash. Five wrong PINs lock the PIN for a minute.
// Only the owner can reset a PIN.
//
// Photos are small JPEGs, removed after 30 days.
// ======================================================

const MINUTE_MS = 60_000;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 60_000;
const OPEN_ENTRY_MAX_MS = 16 * 60 * MINUTE_MS;
const PHOTO_DAYS = 30;
const MAX_PHOTO_BYTES = 400_000;

// "Late" counts from this many minutes after the
// planned start; "not arrived" from the same moment.
const GRACE_MINUTES = 5;

const WEAK_PINS = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555",
  "6666", "7777", "8888", "9999", "1234", "4321",
  "0123", "9876",
]);

function clockError(message, code, statusCode) {
  const error = new AppError(message, statusCode);

  error.code = code;

  return error;
}

function minutesBetween(start, end) {
  return Math.max(0, Math.round((end - start) / MINUTE_MS));
}

function isOpen(entry, now) {
  return (
    entry &&
    !entry.clockOutAt &&
    now - entry.clockInAt.getTime() < OPEN_ENTRY_MAX_MS
  );
}

function entryDto(entry) {
  return {
    id: entry.id,
    therapistId: entry.therapistId,
    clockInAt: entry.clockInAt.toISOString(),
    clockOutAt: entry.clockOutAt?.toISOString() ?? null,
    hasInPhoto: Boolean(entry.hasInPhoto ?? entry.clockInPhoto),
    hasOutPhoto: Boolean(entry.hasOutPhoto ?? entry.clockOutPhoto),
    editedByOwner: entry.editedByOwner,
  };
}

// Entries without their photos (those are fetched one by
// one with photo()).
const ENTRY_SELECT = {
  id: true,
  therapistId: true,
  clockInAt: true,
  clockOutAt: true,
  editedByOwner: true,
};

async function withPhotoFlags(entries) {
  if (entries.length === 0) {
    return [];
  }

  const rows = await prisma.$queryRaw`
    SELECT id,
           "clockInPhoto" IS NOT NULL AS "hasInPhoto",
           "clockOutPhoto" IS NOT NULL AS "hasOutPhoto"
    FROM "TimeEntry"
    WHERE id = ANY(${entries.map((entry) => entry.id)})
  `;

  const flags = new Map(rows.map((row) => [row.id, row]));

  return entries.map((entry) => ({
    ...entry,
    hasInPhoto: flags.get(entry.id)?.hasInPhoto ?? false,
    hasOutPhoto: flags.get(entry.id)?.hasOutPhoto ?? false,
  }));
}

async function loadDay(businessId, date) {
  return prisma.therapist.findMany({
    where: { businessId, isActive: true },
    include: {
      workingHours: true,
      scheduleDays: { where: { date: toDbDate(date) } },
      absences: {
        where: {
          startDate: { lte: toDbDate(date) },
          endDate: { gte: toDbDate(date) },
        },
      },
    },
    orderBy: { name: "asc" },
  });
}

class TeamClockService {
  /**
   * GET /team/clock
   * Everyone who can use the time clock, with what their
   * next punch will be.
   */
  async staff(businessId) {
    const business = await this.#business(businessId);
    const now = Date.now();
    const today = this.#today(business);

    const therapists = await loadDay(businessId, today);

    const lastEntries = await this.#lastEntries(
      therapists.map((therapist) => therapist.id)
    );

    return {
      date: today,
      staff: therapists.map((therapist) => {
        const last = lastEntries.get(therapist.id);
        const day = therapistDay(therapist, today);
        const open = isOpen(last, now);

        return {
          id: therapist.id,
          name: therapist.name,
          hasPin: Boolean(therapist.pinHash),
          next: open ? "OUT" : "IN",
          inSince: open ? last.clockInAt.toISOString() : null,
          periods: day.periods,
          absence: day.absence
            ? { reason: day.absence.reason }
            : null,
        };
      }),
    };
  }

  /**
   * POST /team/clock/pin { therapistId, pin }
   * A therapist without a PIN chooses one.
   */
  async createPin(businessId, therapistId, pin) {
    const therapist = await this.#therapist(businessId, therapistId);

    if (therapist.pinHash) {
      throw new ConflictError(
        "This therapist already has a PIN.",
        ErrorCodes.PIN_ALREADY_SET
      );
    }

    if (!/^\d{4}$/.test(pin) || WEAK_PINS.has(pin)) {
      throw new ValidationError(
        "Choose 4 digits that are not easy to guess.",
        ErrorCodes.PIN_TOO_WEAK
      );
    }

    await prisma.therapist.update({
      where: { id: therapistId },
      data: {
        pinHash: await bcrypt.hash(pin, 10),
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      },
    });

    return { therapistId, hasPin: true };
  }

  /**
   * DELETE /team/therapists/:id/pin
   * The owner resets a forgotten PIN.
   */
  async resetPin(businessId, therapistId) {
    await this.#therapist(businessId, therapistId);

    await prisma.therapist.update({
      where: { id: therapistId },
      data: {
        pinHash: null,
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      },
    });
  }

  /**
   * POST /team/clock/verify { therapistId, pin }
   * Checks the PIN before the selfie is taken.
   */
  async verify(businessId, therapistId, pin) {
    const therapist = await this.#checkPin(businessId, therapistId, pin);
    const last = (await this.#lastEntries([therapistId])).get(therapistId);

    return {
      therapistId,
      name: therapist.name,
      next: isOpen(last, Date.now()) ? "OUT" : "IN",
    };
  }

  /**
   * POST /team/clock/punch { therapistId, pin, photo }
   * photo: base64 JPEG.
   */
  async punch(businessId, therapistId, pin, photo) {
    const business = await this.#business(businessId);
    const therapist = await this.#checkPin(businessId, therapistId, pin);

    const image = photo ? Buffer.from(photo, "base64") : null;

    if (image && image.length > MAX_PHOTO_BYTES) {
      throw new ValidationError(
        "The photo is too large.",
        ErrorCodes.VALIDATION_ERROR
      );
    }

    const now = new Date();
    const last = (await this.#lastEntries([therapistId])).get(therapistId);

    this.#removeOldPhotos(businessId).catch(() => {});

    const today = this.#today(business);
    const range = getUtcRangeForLocalDay(today, business.timezone);

    if (isOpen(last, now.getTime())) {
      await prisma.timeEntry.update({
        where: { id: last.id },
        data: { clockOutAt: now, clockOutPhoto: image },
      });

      const todays = await prisma.timeEntry.findMany({
        where: {
          therapistId,
          clockInAt: { gte: range.start, lt: range.end },
          clockOutAt: { not: null },
        },
        select: { clockInAt: true, clockOutAt: true },
      });

      return {
        action: "OUT",
        at: now.toISOString(),
        name: therapist.name,
        workedMinutes: minutesBetween(last.clockInAt, now),
        workedTodayMinutes: todays.reduce(
          (total, entry) =>
            total + minutesBetween(entry.clockInAt, entry.clockOutAt),
          0
        ),
        nextShift: await this.#nextShift(therapistId, today),
      };
    }

    await prisma.timeEntry.create({
      data: {
        businessId,
        therapistId,
        clockInAt: now,
        clockInPhoto: image,
      },
    });

    const [day] = (await loadDay(businessId, today)).filter(
      (row) => row.id === therapistId
    );

    const plannedStart = day
      ? therapistDay(day, today).periods[0]?.startMinutes ?? null
      : null;

    const nowMinutes = DateTime.fromJSDate(now, {
      zone: business.timezone,
    });

    const appointments = await prisma.appointment.findMany({
      where: {
        therapistId,
        status: "CONFIRMED",
        startTime: { gte: range.start, lt: range.end },
      },
      include: { room: { select: { name: true } } },
      orderBy: { startTime: "asc" },
    });

    const upcoming = appointments.find(
      (appointment) => appointment.endTime > now
    );

    return {
      action: "IN",
      at: now.toISOString(),
      name: therapist.name,
      plannedStartMinutes: plannedStart,
      // Positive: early, negative: late.
      minutesEarly:
        plannedStart === null
          ? null
          : plannedStart - (nowMinutes.hour * 60 + nowMinutes.minute),
      appointmentCount: appointments.length,
      firstAppointment: upcoming
        ? {
            startTime: upcoming.startTime.toISOString(),
            roomName: upcoming.room.name,
          }
        : null,
    };
  }

  /**
   * GET /team/attendance?date=YYYY-MM-DD
   * Who came when, compared with the schedule.
   */
  async attendance(businessId, date) {
    const business = await this.#business(businessId);
    const timezone = business.timezone;
    const today = this.#today(business);
    const range = getUtcRangeForLocalDay(date, timezone);
    const now = new Date();

    const therapists = await loadDay(businessId, date);

    const entries = await withPhotoFlags(
      await prisma.timeEntry.findMany({
        where: {
          businessId,
          clockInAt: { gte: range.start, lt: range.end },
        },
        select: ENTRY_SELECT,
        orderBy: { clockInAt: "asc" },
      })
    );

    const nowMinutes =
      date === today
        ? DateTime.now().setZone(timezone).hour * 60 +
          DateTime.now().setZone(timezone).minute
        : date < today
          ? 1440
          : -1;

    const rows = therapists.map((therapist) => {
      const day = therapistDay(therapist, date);
      const own = entries.filter(
        (entry) => entry.therapistId === therapist.id
      );

      const plannedStart = day.periods[0]?.startMinutes ?? null;
      const first = own[0];

      const firstMinutes = first
        ? DateTime.fromJSDate(first.clockInAt, { zone: timezone })
        : null;

      const lateMinutes =
        first && plannedStart !== null
          ? firstMinutes.hour * 60 + firstMinutes.minute - plannedStart
          : null;

      const open = own.find((entry) => !entry.clockOutAt);

      let status = "OFF";

      if (own.length > 0) {
        if (open && now - open.clockInAt > OPEN_ENTRY_MAX_MS) {
          status = "FORGOT_CLOCK_OUT";
        } else if (open) {
          status =
            lateMinutes !== null && lateMinutes > GRACE_MINUTES
              ? "LATE"
              : "PRESENT";
        } else {
          status = "DONE";
        }
      } else if (day.absence && day.periods.length === 0) {
        status = "ABSENT";
      } else if (plannedStart !== null) {
        status =
          nowMinutes >= plannedStart + GRACE_MINUTES
            ? "NOT_ARRIVED"
            : "EXPECTED";
      }

      return {
        id: therapist.id,
        name: therapist.name,
        periods: day.periods,
        absence: day.absence ? { reason: day.absence.reason } : null,
        status,
        lateMinutes:
          lateMinutes !== null && lateMinutes > GRACE_MINUTES
            ? lateMinutes
            : 0,
        workedMinutes: own.reduce(
          (total, entry) =>
            total +
            minutesBetween(
              entry.clockInAt,
              entry.clockOutAt ?? (date === today ? now : entry.clockInAt)
            ),
          0
        ),
        entries: own.map(entryDto),
      };
    });

    return { date, therapists: rows };
  }

  /**
   * GET /team/attendance/summary?from&to
   * Worked and planned minutes per therapist over a
   * period (calendar days, inclusive).
   */
  async summary(businessId, from, to) {
    const business = await this.#business(businessId);
    const timezone = business.timezone;

    const start = getUtcRangeForLocalDay(from, timezone).start;
    const end = getUtcRangeForLocalDay(to, timezone).end;

    const [therapists, entries] = await Promise.all([
      prisma.therapist.findMany({
        where: { businessId, isActive: true },
        include: {
          workingHours: true,
          scheduleDays: {
            where: { date: { gte: toDbDate(from), lte: toDbDate(to) } },
          },
          absences: {
            where: {
              startDate: { lte: toDbDate(to) },
              endDate: { gte: toDbDate(from) },
            },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.timeEntry.findMany({
        where: { businessId, clockInAt: { gte: start, lt: end } },
        select: ENTRY_SELECT,
      }),
    ]);

    const dates = [];

    for (let date = from; date <= to; date = addDays(date, 1)) {
      dates.push(date);
    }

    return {
      from,
      to,
      therapists: therapists.map((therapist) => {
        const own = entries.filter(
          (entry) => entry.therapistId === therapist.id
        );

        const plannedMinutes = dates.reduce(
          (total, date) =>
            total +
            therapistDay(therapist, date).periods.reduce(
              (sum, period) =>
                sum + period.endMinutes - period.startMinutes,
              0
            ),
          0
        );

        const lateCount = dates.filter((date) => {
          const plannedStart =
            therapistDay(therapist, date).periods[0]?.startMinutes;

          const first = own.find(
            (entry) =>
              DateTime.fromJSDate(entry.clockInAt, {
                zone: timezone,
              }).toISODate() === date
          );

          if (!first || plannedStart === undefined) {
            return false;
          }

          const local = DateTime.fromJSDate(first.clockInAt, {
            zone: timezone,
          });

          return (
            local.hour * 60 + local.minute - plannedStart > GRACE_MINUTES
          );
        }).length;

        return {
          id: therapist.id,
          name: therapist.name,
          plannedMinutes,
          workedMinutes: own.reduce(
            (total, entry) =>
              entry.clockOutAt
                ? total + minutesBetween(entry.clockInAt, entry.clockOutAt)
                : total,
            0
          ),
          openEntries: own.filter((entry) => !entry.clockOutAt).length,
          lateCount,
        };
      }),
    };
  }

  /**
   * GET /team/attendance/export?from&to
   * One line per shift, for the payroll.
   */
  async exportCsv(businessId, from, to) {
    const business = await this.#business(businessId);
    const timezone = business.timezone;

    const entries = await prisma.timeEntry.findMany({
      where: {
        businessId,
        clockInAt: {
          gte: getUtcRangeForLocalDay(from, timezone).start,
          lt: getUtcRangeForLocalDay(to, timezone).end,
        },
      },
      select: {
        ...ENTRY_SELECT,
        therapist: { select: { name: true } },
      },
      orderBy: [{ clockInAt: "asc" }],
    });

    const local = (value) =>
      value
        ? DateTime.fromJSDate(value, { zone: timezone }).toFormat("HH:mm")
        : "";

    const lines = [
      "Therapeut;Datum;In;Uit;Minuten;Aangepast",
      ...entries.map((entry) =>
        [
          `"${entry.therapist.name.replaceAll('"', '""')}"`,
          DateTime.fromJSDate(entry.clockInAt, { zone: timezone }).toISODate(),
          local(entry.clockInAt),
          local(entry.clockOutAt),
          entry.clockOutAt
            ? minutesBetween(entry.clockInAt, entry.clockOutAt)
            : "",
          entry.editedByOwner ? "ja" : "",
        ].join(";")
      ),
    ];

    return lines.join("\n");
  }

  /**
   * GET /team/time-entries/:id/photo/:kind (in | out)
   */
  async photo(businessId, entryId, kind) {
    const entry = await prisma.timeEntry.findFirst({
      where: { id: entryId, businessId },
      select: { clockInPhoto: true, clockOutPhoto: true },
    });

    const photo =
      kind === "out" ? entry?.clockOutPhoto : entry?.clockInPhoto;

    if (!photo) {
      throw new NotFoundError(
        "Photo not found.",
        ErrorCodes.TIME_ENTRY_NOT_FOUND
      );
    }

    return Buffer.from(photo);
  }

  /**
   * POST /team/time-entries { therapistId, clockInAt, clockOutAt? }
   * The owner adds a forgotten shift.
   */
  async addEntry(businessId, data) {
    await this.#therapist(businessId, data.therapistId);
    this.#checkTimes(data.clockInAt, data.clockOutAt);

    const entry = await prisma.timeEntry.create({
      data: {
        businessId,
        therapistId: data.therapistId,
        clockInAt: new Date(data.clockInAt),
        clockOutAt: data.clockOutAt ? new Date(data.clockOutAt) : null,
        editedByOwner: true,
      },
      select: ENTRY_SELECT,
    });

    return entryDto(entry);
  }

  /**
   * PATCH /team/time-entries/:id { clockInAt?, clockOutAt? }
   */
  async updateEntry(businessId, entryId, data) {
    const entry = await this.#entry(businessId, entryId);

    const clockInAt = data.clockInAt
      ? new Date(data.clockInAt)
      : entry.clockInAt;

    const clockOutAt =
      data.clockOutAt === undefined
        ? entry.clockOutAt
        : data.clockOutAt
          ? new Date(data.clockOutAt)
          : null;

    this.#checkTimes(clockInAt, clockOutAt);

    const updated = await prisma.timeEntry.update({
      where: { id: entryId },
      data: { clockInAt, clockOutAt, editedByOwner: true },
      select: ENTRY_SELECT,
    });

    return entryDto(updated);
  }

  async deleteEntry(businessId, entryId) {
    await this.#entry(businessId, entryId);

    await prisma.timeEntry.delete({ where: { id: entryId } });
  }

  async #checkPin(businessId, therapistId, pin) {
    const therapist = await this.#therapist(businessId, therapistId);

    if (!therapist.pinHash) {
      throw clockError(
        "This therapist has no PIN yet.",
        ErrorCodes.PIN_NOT_SET,
        400
      );
    }

    if (
      therapist.pinLockedUntil &&
      therapist.pinLockedUntil > new Date()
    ) {
      throw clockError(
        "Too many wrong PINs. Try again in a minute.",
        ErrorCodes.PIN_LOCKED,
        429
      );
    }

    const correct = await bcrypt.compare(String(pin), therapist.pinHash);

    if (!correct) {
      const attempts = therapist.pinFailedAttempts + 1;
      const locked = attempts >= MAX_ATTEMPTS;

      await prisma.therapist.update({
        where: { id: therapistId },
        data: {
          pinFailedAttempts: locked ? 0 : attempts,
          pinLockedUntil: locked ? new Date(Date.now() + LOCK_MS) : null,
        },
      });

      const error = clockError(
        locked
          ? "Too many wrong PINs. Try again in a minute."
          : "Wrong PIN.",
        locked ? ErrorCodes.PIN_LOCKED : ErrorCodes.PIN_INCORRECT,
        locked ? 429 : 422
      );

      // The app shows how many tries are left.
      error.details = [{ attemptsLeft: locked ? 0 : MAX_ATTEMPTS - attempts }];

      throw error;
    }

    if (therapist.pinFailedAttempts > 0 || therapist.pinLockedUntil) {
      await prisma.therapist.update({
        where: { id: therapistId },
        data: { pinFailedAttempts: 0, pinLockedUntil: null },
      });
    }

    return therapist;
  }

  async #nextShift(therapistId, today) {
    const to = addDays(today, 14);

    const therapist = await prisma.therapist.findUnique({
      where: { id: therapistId },
      include: {
        workingHours: true,
        scheduleDays: {
          where: { date: { gt: toDbDate(today), lte: toDbDate(to) } },
        },
        absences: {
          where: {
            startDate: { lte: toDbDate(to) },
            endDate: { gt: toDbDate(today) },
          },
        },
      },
    });

    for (let date = addDays(today, 1); date <= to; date = addDays(date, 1)) {
      const periods = therapistDay(therapist, date).periods;

      if (periods.length > 0) {
        return { date, startMinutes: periods[0].startMinutes };
      }
    }

    return null;
  }

  async #lastEntries(therapistIds) {
    if (therapistIds.length === 0) {
      return new Map();
    }

    const entries = await prisma.timeEntry.findMany({
      where: { therapistId: { in: therapistIds } },
      distinct: ["therapistId"],
      orderBy: [{ therapistId: "asc" }, { clockInAt: "desc" }],
      select: ENTRY_SELECT,
    });

    return new Map(entries.map((entry) => [entry.therapistId, entry]));
  }

  async #removeOldPhotos(businessId) {
    const before = new Date(Date.now() - PHOTO_DAYS * 86_400_000);

    await prisma.timeEntry.updateMany({
      where: {
        businessId,
        clockInAt: { lt: before },
        OR: [
          { clockInPhoto: { not: null } },
          { clockOutPhoto: { not: null } },
        ],
      },
      data: { clockInPhoto: null, clockOutPhoto: null },
    });
  }

  #checkTimes(clockInAt, clockOutAt) {
    const start = new Date(clockInAt);
    const end = clockOutAt ? new Date(clockOutAt) : null;

    if (
      Number.isNaN(start.getTime()) ||
      (end && (Number.isNaN(end.getTime()) || end <= start))
    ) {
      throw new ValidationError(
        "Clocking out must come after clocking in.",
        ErrorCodes.VALIDATION_ERROR
      );
    }
  }

  #today(business) {
    return DateTime.now().setZone(business.timezone).toISODate();
  }

  async #business(businessId) {
    const business = await businessRepository.findById(businessId);

    if (!business) {
      throw new NotFoundError(
        "Business not found.",
        ErrorCodes.BUSINESS_NOT_FOUND
      );
    }

    return business;
  }

  async #therapist(businessId, therapistId) {
    const therapist = await prisma.therapist.findFirst({
      where: { id: therapistId, businessId, isActive: true },
    });

    if (!therapist) {
      throw new NotFoundError(
        "Therapist not found.",
        ErrorCodes.THERAPIST_NOT_FOUND
      );
    }

    return therapist;
  }

  async #entry(businessId, entryId) {
    const entry = await prisma.timeEntry.findFirst({
      where: { id: entryId, businessId },
      select: ENTRY_SELECT,
    });

    if (!entry) {
      throw new NotFoundError(
        "Time entry not found.",
        ErrorCodes.TIME_ENTRY_NOT_FOUND
      );
    }

    return entry;
  }
}

export default new TeamClockService();
