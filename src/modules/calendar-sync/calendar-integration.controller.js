import calendarIntegrationService from "./calendar-integration.service.js";
import {
  connectIcloudSchema,
  connectIcsSchema,
  saveIcloudCalendarsSchema,
  updateCalendarSchema,
} from "./calendar-integration.validator.js";

// ======================================================
// Calendar Integration Controller
// ======================================================
//
// Passwords and ICS links only travel inwards: no
// response ever contains them.
// ======================================================

class CalendarIntegrationController {
  /**
   * GET /businesses/:businessId/calendar-integrations
   */
  async list(request, reply) {
    const data = await calendarIntegrationService.list(
      request.params.businessId
    );

    return reply.send({ success: true, data });
  }

  /**
   * POST /businesses/:businessId/calendar-integrations/icloud
   *      { username, password }
   */
  async connectIcloud(request, reply) {
    const body = connectIcloudSchema.parse(request.body);

    const data = await calendarIntegrationService.connectIcloud(
      request.params.businessId,
      body
    );

    return reply.status(201).send({ success: true, data });
  }

  /**
   * GET /businesses/:businessId/calendar-integrations/:connectionId/remote-calendars
   */
  async remoteCalendars(request, reply) {
    const data = await calendarIntegrationService.remoteCalendars(
      request.params.businessId,
      request.params.connectionId
    );

    return reply.send({ success: true, data });
  }

  /**
   * PUT /businesses/:businessId/calendar-integrations/:connectionId/calendars
   *     { calendars: [{ remoteUrl, read, travelMinutes }], writeUrl }
   */
  async saveIcloudCalendars(request, reply) {
    const body = saveIcloudCalendarsSchema.parse(request.body);

    const data = await calendarIntegrationService.saveIcloudCalendars(
      request.params.businessId,
      request.params.connectionId,
      body
    );

    return reply.send({ success: true, data });
  }

  /**
   * POST /businesses/:businessId/calendar-integrations/ics
   *      { name, url, travelMinutes }
   */
  async connectIcs(request, reply) {
    const body = connectIcsSchema.parse(request.body);

    const data = await calendarIntegrationService.connectIcs(
      request.params.businessId,
      body
    );

    return reply.status(201).send({ success: true, data });
  }

  /**
   * PATCH /businesses/:businessId/calendar-integrations/calendars/:calendarId
   *       { displayName?, travelMinutes?, isActive? }
   */
  async updateCalendar(request, reply) {
    const body = updateCalendarSchema.parse(request.body);

    const data = await calendarIntegrationService.updateCalendar(
      request.params.businessId,
      request.params.calendarId,
      body
    );

    return reply.send({ success: true, data });
  }

  /**
   * POST /businesses/:businessId/calendar-integrations/sync
   */
  async sync(request, reply) {
    const data = await calendarIntegrationService.sync(
      request.params.businessId
    );

    return reply.send({ success: true, data });
  }

  /**
   * DELETE /businesses/:businessId/calendar-integrations/:connectionId
   */
  async disconnect(request, reply) {
    const data = await calendarIntegrationService.disconnect(
      request.params.businessId,
      request.params.connectionId
    );

    return reply.send({ success: true, data });
  }
}

export default new CalendarIntegrationController();
