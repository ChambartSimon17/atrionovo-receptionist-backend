import { z } from "zod";

import { authenticate } from "../../middleware/auth.middleware.js";
import { requireBusinessOwnership } from "../../middleware/business-ownership.middleware.js";
import { requireBusinessType } from "../../middleware/business-type.middleware.js";

import teamScheduleService from "./team-schedule.service.js";
import teamClockService from "./team-clock.service.js";

// ======================================================
// Team routes (MASSAGE businesses)
// ======================================================
//
// prefix /businesses/:businessId/team
//
// Schedule
//   GET    /schedule?from&days
//   GET    /therapists/:therapistId?today
//   PUT    /therapists/:therapistId/days/:date   { periods }
//   DELETE /therapists/:therapistId/days/:date
//   POST   /absences
//   PATCH  /absences/:absenceId
//   GET    /absences/:absenceId                 with conflicts
//   DELETE /absences/:absenceId
//   GET    /absences/:absenceId/conflicts
//   POST   /appointments/:appointmentId/reassign { therapistId }
//
// Time clock (the device at the counter is logged in as
// the owner)
//   GET    /clock
//   POST   /clock/pin       { therapistId, pin }
//   POST   /clock/verify    { therapistId, pin }
//   POST   /clock/punch     { therapistId, pin, photo }
//   DELETE /therapists/:therapistId/pin
//
// Attendance
//   GET    /attendance?date
//   GET    /attendance/summary?from&to
//   GET    /attendance/export?from&to          CSV
//   GET    /time-entries/:entryId/photo/:kind  JPEG
//   POST   /time-entries
//   PATCH  /time-entries/:entryId
//   DELETE /time-entries/:entryId
// ======================================================

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const minutes = z.number().int().min(0).max(1440);

const periodsSchema = z.object({
  periods: z.array(
    z.object({ startMinutes: minutes, endMinutes: minutes })
  ),
});

const absenceFields = {
  reason: z.enum(["SICK", "LEAVE", "PERSONAL", "TRAINING"]),
  startDate: date,
  endDate: date,
  startMinutes: minutes.nullable().optional(),
  endMinutes: minutes.nullable().optional(),
  note: z.string().trim().max(200).nullable().optional(),
};

const createAbsenceSchema = z.object({
  therapistId: z.string().min(1),
  ...absenceFields,
});

const updateAbsenceSchema = z
  .object(absenceFields)
  .partial();

const pinSchema = z.object({
  therapistId: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/),
});

const punchSchema = pinSchema.extend({
  photo: z.string().max(600_000).nullable().optional(),
});

const timestamp = z.string().datetime({ offset: true });

const addEntrySchema = z.object({
  therapistId: z.string().min(1),
  clockInAt: timestamp,
  clockOutAt: timestamp.nullable().optional(),
});

const updateEntrySchema = z.object({
  clockInAt: timestamp.optional(),
  clockOutAt: timestamp.nullable().optional(),
});

const rangeSchema = z.object({ from: date, to: date });

const preHandler = [
  authenticate,
  requireBusinessOwnership,
  requireBusinessType("MASSAGE"),
];

const ok = (data) => ({ success: true, data });

export default async function teamRoutes(fastify) {
  const route = (method, path, handler) =>
    fastify[method](
      `/:businessId/team${path}`,
      { preHandler },
      handler
    );

  // ----------------------------------------------------
  // Schedule
  // ----------------------------------------------------

  route("get", "/schedule", async (request) => {
    const query = z
      .object({ from: date, days: z.coerce.number().optional() })
      .parse(request.query ?? {});

    return ok(
      await teamScheduleService.week(request.params.businessId, query)
    );
  });

  route("get", "/therapists/:therapistId", async (request) => {
    const { today } = z
      .object({ today: date })
      .parse(request.query ?? {});

    return ok(
      await teamScheduleService.therapist(
        request.params.businessId,
        request.params.therapistId,
        today
      )
    );
  });

  route("put", "/therapists/:therapistId/days/:date", async (request) => {
    const day = date.parse(request.params.date);
    const { periods } = periodsSchema.parse(request.body);

    return ok(
      await teamScheduleService.setDay(
        request.params.businessId,
        request.params.therapistId,
        day,
        periods
      )
    );
  });

  route(
    "delete",
    "/therapists/:therapistId/days/:date",
    async (request, reply) => {
      await teamScheduleService.clearDay(
        request.params.businessId,
        request.params.therapistId,
        date.parse(request.params.date)
      );

      return reply.status(204).send();
    }
  );

  route("post", "/absences", async (request, reply) => {
    const data = createAbsenceSchema.parse(request.body);

    return reply
      .status(201)
      .send(
        ok(
          await teamScheduleService.createAbsence(
            request.params.businessId,
            data
          )
        )
      );
  });

  route("patch", "/absences/:absenceId", async (request) =>
    ok(
      await teamScheduleService.updateAbsence(
        request.params.businessId,
        request.params.absenceId,
        updateAbsenceSchema.parse(request.body)
      )
    )
  );

  route("get", "/absences/:absenceId", async (request) =>
    ok(
      await teamScheduleService.absence(
        request.params.businessId,
        request.params.absenceId
      )
    )
  );

  route("delete", "/absences/:absenceId", async (request, reply) => {
    await teamScheduleService.deleteAbsence(
      request.params.businessId,
      request.params.absenceId
    );

    return reply.status(204).send();
  });

  route("get", "/absences/:absenceId/conflicts", async (request) =>
    ok(
      await teamScheduleService.conflicts(
        request.params.businessId,
        request.params.absenceId
      )
    )
  );

  route(
    "post",
    "/appointments/:appointmentId/reassign",
    async (request) => {
      const { therapistId } = z
        .object({ therapistId: z.string().min(1) })
        .parse(request.body);

      return ok(
        await teamScheduleService.reassign(
          request.params.businessId,
          request.params.appointmentId,
          therapistId
        )
      );
    }
  );

  // ----------------------------------------------------
  // Time clock
  // ----------------------------------------------------

  route("get", "/clock", async (request) =>
    ok(await teamClockService.staff(request.params.businessId))
  );

  route("post", "/clock/pin", async (request, reply) => {
    const { therapistId, pin } = pinSchema.parse(request.body);

    return reply
      .status(201)
      .send(
        ok(
          await teamClockService.createPin(
            request.params.businessId,
            therapistId,
            pin
          )
        )
      );
  });

  route("post", "/clock/verify", async (request) => {
    const { therapistId, pin } = pinSchema.parse(request.body);

    return ok(
      await teamClockService.verify(
        request.params.businessId,
        therapistId,
        pin
      )
    );
  });

  route("post", "/clock/punch", async (request) => {
    const { therapistId, pin, photo } = punchSchema.parse(request.body);

    return ok(
      await teamClockService.punch(
        request.params.businessId,
        therapistId,
        pin,
        photo
      )
    );
  });

  route("delete", "/therapists/:therapistId/pin", async (request, reply) => {
    await teamClockService.resetPin(
      request.params.businessId,
      request.params.therapistId
    );

    return reply.status(204).send();
  });

  // ----------------------------------------------------
  // Attendance
  // ----------------------------------------------------

  route("get", "/attendance", async (request) => {
    const query = z.object({ date }).parse(request.query ?? {});

    return ok(
      await teamClockService.attendance(
        request.params.businessId,
        query.date
      )
    );
  });

  route("get", "/attendance/summary", async (request) => {
    const { from, to } = rangeSchema.parse(request.query ?? {});

    return ok(
      await teamClockService.summary(request.params.businessId, from, to)
    );
  });

  route("get", "/attendance/export", async (request, reply) => {
    const { from, to } = rangeSchema.parse(request.query ?? {});

    const csv = await teamClockService.exportCsv(
      request.params.businessId,
      from,
      to
    );

    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header(
        "Content-Disposition",
        `attachment; filename="uren-${from}-${to}.csv"`
      )
      .send(csv);
  });

  route(
    "get",
    "/time-entries/:entryId/photo/:kind",
    async (request, reply) => {
      const photo = await teamClockService.photo(
        request.params.businessId,
        request.params.entryId,
        request.params.kind
      );

      return reply
        .header("Content-Type", "image/jpeg")
        .header("Cache-Control", "private, max-age=86400")
        .send(photo);
    }
  );

  route("post", "/time-entries", async (request, reply) =>
    reply
      .status(201)
      .send(
        ok(
          await teamClockService.addEntry(
            request.params.businessId,
            addEntrySchema.parse(request.body)
          )
        )
      )
  );

  route("patch", "/time-entries/:entryId", async (request) =>
    ok(
      await teamClockService.updateEntry(
        request.params.businessId,
        request.params.entryId,
        updateEntrySchema.parse(request.body)
      )
    )
  );

  route("delete", "/time-entries/:entryId", async (request, reply) => {
    await teamClockService.deleteEntry(
      request.params.businessId,
      request.params.entryId
    );

    return reply.status(204).send();
  });
}
