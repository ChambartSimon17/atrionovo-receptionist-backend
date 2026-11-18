import calendarIntegrationController from "./calendar-integration.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requireBusinessOwnership } from "../../middleware/business-ownership.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";

// ======================================================
// Calendar Integration Routes
// ======================================================
//
// prefix /businesses
//
//   GET    /:businessId/calendar-integrations
//   POST   /:businessId/calendar-integrations/icloud
//   GET    /:businessId/calendar-integrations/:connectionId/remote-calendars
//   PUT    /:businessId/calendar-integrations/:connectionId/calendars
//   POST   /:businessId/calendar-integrations/ics
//   PATCH  /:businessId/calendar-integrations/calendars/:calendarId
//   POST   /:businessId/calendar-integrations/sync
//   DELETE /:businessId/calendar-integrations/:connectionId
//
// Own business only, and only the owner or a manager:
// these routes take a password and decide what is busy.
// ======================================================

const preHandler = [
  authenticate,
  requireBusinessOwnership,
  requireRole("OWNER", "MANAGER"),
];

export default async function calendarIntegrationRoutes(fastify) {
  const c = calendarIntegrationController;
  const base = "/:businessId/calendar-integrations";

  fastify.get(base, { preHandler }, c.list.bind(c));
  fastify.post(`${base}/icloud`, { preHandler }, c.connectIcloud.bind(c));
  fastify.post(`${base}/ics`, { preHandler }, c.connectIcs.bind(c));
  fastify.post(`${base}/sync`, { preHandler }, c.sync.bind(c));
  fastify.patch(`${base}/calendars/:calendarId`, { preHandler }, c.updateCalendar.bind(c));
  fastify.get(`${base}/:connectionId/remote-calendars`, { preHandler }, c.remoteCalendars.bind(c));
  fastify.put(`${base}/:connectionId/calendars`, { preHandler }, c.saveIcloudCalendars.bind(c));
  fastify.delete(`${base}/:connectionId`, { preHandler }, c.disconnect.bind(c));
}
