import { DateTime } from "luxon";

import prisma from "../../db/prisma.js";
import businessRepository from "../business/business.repository.js";
import {
  absenceCoversDate,
  addDays,
  fromDbDate,
  resolveDay,
  toDbDate,
} from "../therapist/schedule.js";
import { validateWorkingHours } from "../therapist/working-hours.js";
import { localMinutesToMs } from "../massage-appointment/local-time.js";
import ConflictError from "../../errors/ConflictError.js";
import NotFoundError from "../../errors/NotFoundError.js";
import ValidationError from "../../errors/ValidationError.js";
import { ErrorCodes } from "../../errors/error-codes.js";
import {
  dateToMinutes,
  getUtcRangeForLocalDay,
} from "../../utils/time.utils.js";
import { runTransaction } from "../../utils/transaction.utils.js";

// ======================================================
// Team Schedule
// ======================================================
//
// Responsibility
// The real schedule of the therapists, date by date:
//
// - the week view (who works when, who is away)
// - changing the hours of one date
// - absences (sick, leave, personal, training) and the
//   appointments that fall in them
// - giving such an appointment to a free colleague
//
// Which periods count on a date is decided in
// therapist/schedule.js; booking uses the same rules.
// ======================================================

const DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

const MINUTE_MS = 60_000;

export function dayOfWeekOf(date) {
  return DAYS[DateTime.fromISO(date).weekday - 1];
}

export function absenceDto(absence) {
  return {
    id: absence.id,
    therapistId: absence.therapistId,
    therapistName: absence.therapist?.name,
    reason: absence.reason,
    startDate: fromDbDate(absence.startDate),
    endDate: fromDbDate(absence.endDate),
    startMinutes: absence.startMinutes,
    endMinutes: absence.endMinutes,
    note: absence.note,
  };
}

function appointmentDto(appointment) {
  return {
    id: appointment.id,
    startTime: appointment.startTime.toISOString(),
    endTime: appointment.endTime.toISOString(),
    serviceName: appointment.serviceName,
    firstName: appointment.firstName,
    lastName: appointment.lastName,
    phoneNumber: appointment.phoneNumber,
    therapistId: appointment.therapistId,
    therapistName: appointment.therapist?.name,
    roomName: appointment.room?.name,
  };
}

/**
 * Loads the therapists of a business with everything the
 * schedule of [from, to] (calendar days, inclusive)
 * depends on.
 */
async function loadTherapists(businessId, from, to, where = {}) {
  return prisma.therapist.findMany({
    where: { businessId, isActive: true, ...where },
    include: {
      workingHours: true,
      services: { select: { massageServiceId: true } },
      scheduleDays: {
        where: {
          date: { gte: toDbDate(from), lte: toDbDate(to) },
        },
      },
      absences: {
        where: {
          startDate: { lte: toDbDate(to) },
          endDate: { gte: toDbDate(from) },
        },
      },
    },
    orderBy: { name: "asc" },
  });
}

/**
 * The resolved day of a therapist loaded by
 * loadTherapists.
 */
export function therapistDay(therapist, date) {
  const dayOfWeek = dayOfWeekOf(date);

  return resolveDay({
    weekly: therapist.workingHours.filter(
      (period) => period.dayOfWeek === dayOfWeek
    ),
    scheduleDay:
      therapist.scheduleDays.find(
        (day) => fromDbDate(day.date) === date
      ) ?? null,
    absences: therapist.absences.filter((absence) =>
      absenceCoversDate(absence, date)
    ),
  });
}

/**
 * Whether an appointment (local start and end) falls in
 * an absence.
 */
function appointmentInAbsence(appointment, absence, timezone) {
  const date = DateTime.fromJSDate(appointment.startTime, {
    zone: timezone,
  }).toISODate();

  if (!absenceCoversDate(absence, date)) {
    return false;
  }

  if (absence.startMinutes === null || absence.endMinutes === null) {
    return true;
  }

  const start = dateToMinutes(appointment.startTime, timezone);
  const end = start + appointment.durationMinutes;

  return start < absence.endMinutes && absence.startMinutes < end;
}

class TeamScheduleService {
  /**
   * GET /team/schedule?from=YYYY-MM-DD&days=7
   */
  async week(businessId, { from, days = 7 }) {
    const count = Math.min(Math.max(Number(days) || 7, 1), 42);
    const to = addDays(from, count - 1);

    const business = await this.#business(businessId);
    const therapists = await loadTherapists(businessId, from, to);

    const dates = Array.from({ length: count }, (_, index) =>
      addDays(from, index)
    );

    const absences = await prisma.therapistAbsence.findMany({
      where: {
        therapist: { businessId },
        startDate: { lte: toDbDate(to) },
        endDate: { gte: toDbDate(from) },
      },
      include: { therapist: { select: { name: true } } },
      orderBy: { startDate: "asc" },
    });

    const withCounts = await Promise.all(
      absences.map(async (absence) => ({
        ...absenceDto(absence),
        appointmentCount: (
          await this.#appointmentsInAbsence(business, absence)
        ).length,
      }))
    );

    return {
      from,
      to,
      dates,
      therapists: therapists.map((therapist) => ({
        id: therapist.id,
        name: therapist.name,
        days: dates.map((date) => {
          const day = therapistDay(therapist, date);

          return {
            date,
            periods: day.periods,
            planned: day.planned,
            source: day.source,
            absence: day.absence
              ? {
                  id: day.absence.id,
                  reason: day.absence.reason,
                  partial: day.absence.startMinutes !== null,
                }
              : null,
          };
        }),
      })),
      absences: withCounts,
    };
  }

  /**
   * One therapist for the detail screen: weekly hours,
   * the coming changes and absences, and this month.
   */
  async therapist(businessId, therapistId, today) {
    const therapist = await prisma.therapist.findFirst({
      where: { id: therapistId, businessId },
      include: {
        workingHours: {
          orderBy: [{ dayOfWeek: "asc" }, { startMinutes: "asc" }],
        },
        services: { select: { massageServiceId: true } },
        scheduleDays: {
          where: { date: { gte: toDbDate(today) } },
          orderBy: { date: "asc" },
        },
        absences: {
          where: { endDate: { gte: toDbDate(today) } },
          orderBy: { startDate: "asc" },
        },
      },
    });

    if (!therapist) {
      throw new NotFoundError(
        "Therapist not found.",
        ErrorCodes.THERAPIST_NOT_FOUND
      );
    }

    const business = await this.#business(businessId);

    const monthStart = DateTime.fromISO(today, {
      zone: business.timezone,
    }).startOf("month");

    const [entries, appointmentCount, lastEntry] = await Promise.all([
      prisma.timeEntry.findMany({
        where: {
          therapistId,
          clockInAt: {
            gte: monthStart.toJSDate(),
            lt: monthStart.plus({ months: 1 }).toJSDate(),
          },
        },
        select: { clockInAt: true, clockOutAt: true },
      }),
      prisma.appointment.count({
        where: {
          therapistId,
          status: { in: ["CONFIRMED", "COMPLETED"] },
          startTime: {
            gte: monthStart.toJSDate(),
            lt: monthStart.plus({ months: 1 }).toJSDate(),
          },
        },
      }),
      prisma.timeEntry.findFirst({
        where: { therapistId },
        orderBy: { clockInAt: "desc" },
        select: { clockInAt: true, clockOutAt: true },
      }),
    ]);

    const workedMinutes = entries.reduce(
      (total, entry) =>
        entry.clockOutAt
          ? total +
            Math.round(
              (entry.clockOutAt - entry.clockInAt) / MINUTE_MS
            )
          : total,
      0
    );

    return {
      id: therapist.id,
      name: therapist.name,
      isActive: therapist.isActive,
      hasPin: Boolean(therapist.pinHash),
      serviceIds: therapist.services.map(
        (link) => link.massageServiceId
      ),
      workingHours: therapist.workingHours.map((period) => ({
        dayOfWeek: period.dayOfWeek,
        startMinutes: period.startMinutes,
        endMinutes: period.endMinutes,
      })),
      scheduleDays: therapist.scheduleDays.map((day) => ({
        date: fromDbDate(day.date),
        periods: day.periods,
        weekly: therapist.workingHours
          .filter(
            (period) =>
              period.dayOfWeek === dayOfWeekOf(fromDbDate(day.date))
          )
          .map((period) => ({
            startMinutes: period.startMinutes,
            endMinutes: period.endMinutes,
          })),
      })),
      absences: therapist.absences.map(absenceDto),
      month: {
        workedMinutes,
        appointmentCount,
      },
      lastEntry: lastEntry
        ? {
            clockInAt: lastEntry.clockInAt.toISOString(),
            clockOutAt: lastEntry.clockOutAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  /**
   * PUT /team/therapists/:id/days/:date { periods }
   * Other hours on one date; an empty list is a day off.
   */
  async setDay(businessId, therapistId, date, periods) {
    await this.#therapist(businessId, therapistId);

    validateWorkingHours(
      periods.map((period) => ({ ...period, dayOfWeek: "DAY" }))
    );

    const row = await prisma.therapistScheduleDay.upsert({
      where: {
        therapistId_date: { therapistId, date: toDbDate(date) },
      },
      create: { therapistId, date: toDbDate(date), periods },
      update: { periods },
    });

    return { date, periods: row.periods };
  }

  /**
   * DELETE /team/therapists/:id/days/:date
   * Back to the weekly hours.
   */
  async clearDay(businessId, therapistId, date) {
    await this.#therapist(businessId, therapistId);

    await prisma.therapistScheduleDay.deleteMany({
      where: { therapistId, date: toDbDate(date) },
    });
  }

  /**
   * POST /team/absences
   * Returns the absence and the appointments in it.
   */
  async createAbsence(businessId, data) {
    await this.#therapist(businessId, data.therapistId);
    this.#validateAbsence(data);

    const absence = await prisma.therapistAbsence.create({
      data: {
        therapistId: data.therapistId,
        reason: data.reason,
        startDate: toDbDate(data.startDate),
        endDate: toDbDate(data.endDate),
        startMinutes: data.startMinutes ?? null,
        endMinutes: data.endMinutes ?? null,
        note: data.note || null,
      },
      include: { therapist: { select: { name: true } } },
    });

    return {
      absence: absenceDto(absence),
      conflicts: await this.conflicts(businessId, absence.id),
    };
  }

  async updateAbsence(businessId, absenceId, data) {
    const existing = await this.#absence(businessId, absenceId);

    const merged = {
      reason: data.reason ?? existing.reason,
      startDate: data.startDate ?? fromDbDate(existing.startDate),
      endDate: data.endDate ?? fromDbDate(existing.endDate),
      startMinutes:
        data.startMinutes !== undefined
          ? data.startMinutes
          : existing.startMinutes,
      endMinutes:
        data.endMinutes !== undefined
          ? data.endMinutes
          : existing.endMinutes,
      note: data.note !== undefined ? data.note : existing.note,
    };

    this.#validateAbsence(merged);

    const absence = await prisma.therapistAbsence.update({
      where: { id: absenceId },
      data: {
        ...merged,
        startDate: toDbDate(merged.startDate),
        endDate: toDbDate(merged.endDate),
        note: merged.note || null,
      },
      include: { therapist: { select: { name: true } } },
    });

    return {
      absence: absenceDto(absence),
      conflicts: await this.conflicts(businessId, absence.id),
    };
  }

  async deleteAbsence(businessId, absenceId) {
    await this.#absence(businessId, absenceId);

    await prisma.therapistAbsence.delete({ where: { id: absenceId } });
  }

  /**
   * GET /team/absences/:id
   * The absence with the appointments in it.
   */
  async absence(businessId, absenceId) {
    const absence = await this.#absence(businessId, absenceId);

    return {
      absence: absenceDto(absence),
      conflicts: await this.conflicts(businessId, absenceId),
    };
  }

  /**
   * GET /team/absences/:id/conflicts
   * The confirmed appointments in an absence, each with
   * the colleagues who could take it over.
   */
  async conflicts(businessId, absenceId) {
    const business = await this.#business(businessId);
    const absence = await this.#absence(businessId, absenceId);

    const appointments = await this.#appointmentsInAbsence(
      business,
      absence
    );

    return Promise.all(
      appointments.map(async (appointment) => ({
        ...appointmentDto(appointment),
        alternatives: await this.#freeColleagues(
          business,
          appointment
        ),
      }))
    );
  }

  /**
   * POST /team/appointments/:id/reassign { therapistId }
   * Gives an appointment to another therapist, when that
   * therapist works, can perform the massage and is free.
   */
  async reassign(businessId, appointmentId, therapistId) {
    const business = await this.#business(businessId);

    return runTransaction(async (tx) => {
      const appointment = await tx.appointment.findFirst({
        where: { id: appointmentId, businessId },
      });

      if (!appointment) {
        throw new NotFoundError(
          "Appointment not found.",
          ErrorCodes.APPOINTMENT_NOT_FOUND
        );
      }

      if (appointment.status !== "CONFIRMED") {
        throw new ConflictError(
          "Only confirmed appointments can be given to another therapist.",
          ErrorCodes.APPOINTMENT_NOT_CONFIRMED
        );
      }

      const free = await this.#freeColleagues(
        business,
        appointment,
        tx
      );

      if (!free.some((colleague) => colleague.id === therapistId)) {
        throw new ConflictError(
          "This therapist is not free at that time.",
          ErrorCodes.APPOINTMENT_NOT_AVAILABLE
        );
      }

      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: { therapistId },
        include: {
          therapist: { select: { name: true } },
          room: { select: { name: true } },
        },
      });

      return appointmentDto(updated);
    });
  }

  /**
   * Therapists (other than the current one) who work the
   * whole appointment, can perform the massage and have no
   * other appointment then, buffer included.
   */
  async #freeColleagues(business, appointment, db = prisma) {
    const timezone = business.timezone;

    const date = DateTime.fromJSDate(appointment.startTime, {
      zone: timezone,
    }).toISODate();

    const therapists = await loadTherapists(business.id, date, date, {
      id: { not: appointment.therapistId },
      services: {
        some: { massageServiceId: appointment.massageServiceId },
      },
    });

    const bufferMs = business.appointmentBufferMinutes * MINUTE_MS;
    const startMs = appointment.startTime.getTime();
    const endMs = appointment.endTime.getTime();

    const range = getUtcRangeForLocalDay(date, timezone);

    const busy = await db.appointment.findMany({
      where: {
        businessId: business.id,
        id: { not: appointment.id },
        status: { in: ["CONFIRMED", "COMPLETED"] },
        startTime: { lt: range.end },
        endTime: { gt: new Date(range.start.getTime() - bufferMs) },
      },
      select: { therapistId: true, startTime: true, endTime: true },
    });

    return therapists
      .filter((therapist) => {
        const windows = therapistDay(therapist, date).periods.map(
          (period) => ({
            startMs: localMinutesToMs(date, period.startMinutes, timezone),
            endMs: localMinutesToMs(date, period.endMinutes, timezone),
          })
        );

        const works = windows.some(
          (window) => window.startMs <= startMs && endMs <= window.endMs
        );

        const occupied = busy.some(
          (other) =>
            other.therapistId === therapist.id &&
            other.startTime.getTime() < endMs + bufferMs &&
            startMs < other.endTime.getTime() + bufferMs
        );

        return works && !occupied;
      })
      .map((therapist) => ({ id: therapist.id, name: therapist.name }));
  }

  async #appointmentsInAbsence(business, absence) {
    const start = getUtcRangeForLocalDay(
      fromDbDate(absence.startDate),
      business.timezone
    ).start;

    const end = getUtcRangeForLocalDay(
      fromDbDate(absence.endDate),
      business.timezone
    ).end;

    const appointments = await prisma.appointment.findMany({
      where: {
        businessId: business.id,
        therapistId: absence.therapistId,
        status: "CONFIRMED",
        startTime: { gte: start, lt: end },
      },
      include: {
        therapist: { select: { name: true } },
        room: { select: { name: true } },
      },
      orderBy: { startTime: "asc" },
    });

    return appointments.filter((appointment) =>
      appointmentInAbsence(appointment, absence, business.timezone)
    );
  }

  #validateAbsence(data) {
    if (data.endDate < data.startDate) {
      throw new ValidationError(
        "An absence must end on or after its first day.",
        ErrorCodes.VALIDATION_ERROR
      );
    }

    const partial =
      data.startMinutes !== null && data.startMinutes !== undefined;

    if (
      partial &&
      (data.endMinutes === null ||
        data.endMinutes === undefined ||
        data.startMinutes >= data.endMinutes)
    ) {
      throw new ValidationError(
        "A partial absence must start before it ends.",
        ErrorCodes.VALIDATION_ERROR
      );
    }
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
      where: { id: therapistId, businessId },
    });

    if (!therapist) {
      throw new NotFoundError(
        "Therapist not found.",
        ErrorCodes.THERAPIST_NOT_FOUND
      );
    }

    return therapist;
  }

  async #absence(businessId, absenceId) {
    const absence = await prisma.therapistAbsence.findFirst({
      where: { id: absenceId, therapist: { businessId } },
      include: { therapist: { select: { name: true } } },
    });

    if (!absence) {
      throw new NotFoundError(
        "Absence not found.",
        ErrorCodes.ABSENCE_NOT_FOUND
      );
    }

    return absence;
  }
}

export default new TeamScheduleService();
