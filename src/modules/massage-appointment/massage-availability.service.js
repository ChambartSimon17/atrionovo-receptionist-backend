import massageAppointmentRepository from "./massage-appointment.repository.js";
import massageServiceRepository from "../massage-service/massage-service.repository.js";
import businessRepository from "../business/business.repository.js";
import openingScheduleService from "../business/opening-schedule/opening-schedule.service.js";
import {
  buildBusyIntervals,
  buildCandidateMinutes,
  findAvailableSlots,
} from "./massage-scheduling.js";
import {
  localMinutesToMs,
} from "./local-time.js";
import NotFoundError from "../../errors/NotFoundError.js";
import ValidationError from "../../errors/ValidationError.js";
import { ErrorCodes } from "../../errors/error-codes.js";
import {
  dateToDayOfWeek,
  getUtcRangeForLocalDay,
  minutesToTime,
} from "../../utils/time.utils.js";

// ======================================================
// Massage Availability Service
// ======================================================
//
// Responsibility
// Load everything the scheduling rules need for one day
// (opening hours, therapists, rooms, existing
// appointments) and return the bookable start times.
//
// The rules themselves live in massage-scheduling.js.
// ======================================================

class MassageAvailabilityService {
  /**
   * Bookable start times of a day for one massage, for
   * showing to the owner or a customer.
   */
  async findSlots(businessId, { date, serviceId }) {
    const business = await this.#getBusiness(businessId);

    const service = await this.getBookableService(
      businessId,
      serviceId
    );

    const slots = await this.computeSlots({
      business,
      service,
      date,
    });

    return {
      date,
      serviceId: service.id,
      durationMinutes: service.durationMinutes,
      slots: slots.map((slot) => ({
        time: minutesToTime(slot.minutes),
        startTime: new Date(slot.startMs).toISOString(),
      })),
    };
  }

  /**
   * Slots of one local day including the assigned
   * therapist and room. Pass a transaction client as db
   * when the result is used to create an appointment, so
   * the appointments read here are protected from
   * concurrent bookings.
   */
  async computeSlots({
    business,
    service,
    date,
    db,
    nowMs = Date.now(),
  }) {
    const timezone = business.timezone;

    const noon = new Date(
      localMinutesToMs(date, 12 * 60, timezone)
    );

    const openingPeriods =
      await openingScheduleService.findOpeningPeriods(
        business,
        noon
      );

    const candidateMinutes = buildCandidateMinutes({
      openingPeriods,
      durationMinutes: service.durationMinutes,
      intervalMinutes: business.arrivalIntervalMinutes,
    });

    if (candidateMinutes.length === 0) {
      return [];
    }

    const dayOfWeek = dateToDayOfWeek(noon, timezone);

    const [therapists, rooms] = await Promise.all([
      massageAppointmentRepository.findTherapistsForService(
        business.id,
        service.id,
        dayOfWeek
      ),
      massageAppointmentRepository.findRoomsForService(
        business.id,
        service.id
      ),
    ]);

    if (therapists.length === 0 || rooms.length === 0) {
      return [];
    }

    const bufferMinutes =
      business.appointmentBufferMinutes;

    // Appointments that can still occupy a resource during
    // this day (the buffer extends past their end).
    const dayRange = getUtcRangeForLocalDay(
      date,
      timezone
    );

    const existing =
      await massageAppointmentRepository.findOccupying(
        business.id,
        new Date(
          dayRange.start.getTime() -
            bufferMinutes * 60_000
        ),
        dayRange.end,
        db
      );

    const appointments = existing.map((appointment) => ({
      therapistId: appointment.therapistId,
      roomId: appointment.roomId,
      startMs: appointment.startTime.getTime(),
      endMs: appointment.endTime.getTime(),
    }));

    const busy = buildBusyIntervals(
      appointments,
      bufferMinutes
    );

    const countFor = (map, id) =>
      (map.get(id) ?? []).length;

    return findAvailableSlots({
      candidates: candidateMinutes.map((minutes) => ({
        minutes,
        startMs: localMinutesToMs(
          date,
          minutes,
          timezone
        ),
      })),
      nowMs,
      durationMinutes: service.durationMinutes,
      bufferMinutes,
      therapists: therapists.map((therapist) => ({
        id: therapist.id,
        name: therapist.name,
        windows: therapist.workingHours.map(
          (period) => ({
            startMs: localMinutesToMs(
              date,
              period.startMinutes,
              timezone
            ),
            endMs: localMinutesToMs(
              date,
              period.endMinutes,
              timezone
            ),
          })
        ),
        appointmentCount: countFor(
          busy.therapist,
          therapist.id
        ),
      })),
      rooms: rooms.map((room) => ({
        id: room.id,
        name: room.name,
        appointmentCount: countFor(busy.room, room.id),
      })),
      busy,
    });
  }

  /**
   * A massage of the business that can be booked
   * (it exists and is active).
   */
  async getBookableService(businessId, serviceId) {
    const service =
      await massageServiceRepository.findById(
        serviceId,
        businessId
      );

    if (!service) {
      throw new NotFoundError(
        "Massage service not found.",
        ErrorCodes.MASSAGE_SERVICE_NOT_FOUND
      );
    }

    if (!service.isActive) {
      throw new ValidationError(
        "This massage is not available for booking.",
        ErrorCodes.MASSAGE_SERVICE_NOT_FOUND
      );
    }

    return service;
  }

  async #getBusiness(businessId) {
    const business =
      await businessRepository.findById(businessId);

    if (!business) {
      throw new NotFoundError(
        "Business not found.",
        ErrorCodes.BUSINESS_NOT_FOUND
      );
    }

    return business;
  }
}

export default new MassageAvailabilityService();
