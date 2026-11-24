import businessRepository from "../business/business.repository.js";
import customerService from "../customer/customer.service.js";
import massageServiceRepository from "../massage-service/massage-service.repository.js";
import massageAppointmentRepository from "../massage-appointment/massage-appointment.repository.js";
import massageAppointmentService from "../massage-appointment/massage-appointment.service.js";
import massageAvailabilityService from "../massage-appointment/massage-availability.service.js";
import treatmentRoomRepository from "../treatment-room/treatment-room.repository.js";
import calendarSyncService from "../calendar-sync/calendar-sync.service.js";
import insightsService from "../insights/insights.service.js";
import {
  DEFAULT_SEARCH_DAYS,
  MAX_SEARCH_DAYS,
  inPartOfDay,
  nearestTimes,
  nextDate,
  parseWeekday,
  searchDates,
  spreadTimes,
  todayIn,
  weekdayOf,
} from "./massage-search.js";
import pushService from "../insights/push.service.js";
import NotFoundError from "../../errors/NotFoundError.js";
import ValidationError from "../../errors/ValidationError.js";
import { ErrorCodes } from "../../errors/error-codes.js";
import { normalizePhoneNumber } from "../../utils/phone.utils.js";
import {
  localDateTimeStringToUTC,
  minutesToTime,
  utcToLocalDateTimeString,
} from "../../utils/time.utils.js";

// ======================================================
// Assistant Massage Service
// ======================================================
//
// Responsibility
// Voice assistant (Vapi) operations for a MASSAGE business.
//
// Like the restaurant assistant, this service only
// orchestrates existing domain services. The scheduling
// rules (therapist + room, buffer, opening hours) live in
// the massage-appointment module, so a phone booking
// follows exactly the same rules as the dashboard and the
// website widget.
//
// Times
// The assistant speaks business-local time. Times go in and
// out as "2026-11-02T14:00:00" (no time zone) or "14:00".
//
// Locations
// A practice can work at several locations (a room with its
// own opening hours, e.g. a practice at home and a salon).
// The assistant then asks the caller where they want to
// come: getServices lists the locations, checkAvailability
// gives the free times per location, and createAppointment
// needs the chosen location. An appointment keeps its
// location when it is moved.
//
// Searching
// When the requested time or day does not work, the
// assistant must help actively: checkAvailability adds the
// nearest free times that day, the same time on the next
// days, or the next days with room. findAvailability
// searches several days at once ("is there another day at
// 17:00?", "an evening next week", "as soon as possible").
//
// Security
// - The business comes from the x-business-id header of
//   the Vapi tool and must be a MASSAGE business.
// - Changing or cancelling an appointment requires the
//   caller's phone number to match the appointment, so a
//   caller cannot change someone else's appointment by
//   guessing an id. The tools fill the phone number from
//   the incoming call ({{customer.number}}).
// ======================================================

const MAX_ALTERNATIVE_TIMES = 3;

/**
 * The location of an appointment, or null when the
 * practice works at one place.
 */
function locationOf(appointment) {
  return (
    appointment.locationName ??
    (appointment.room?.hasOwnHours ? appointment.room.name : null)
  );
}

/**
 * "The Bridge" -> "thebridge", for matching what the
 * assistant heard against the location names.
 */
function simplify(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * The location the caller meant, or null. Exact match
 * first, then a name that contains (or is contained in)
 * what was said.
 */
export function matchLocation(locations, spoken) {
  const wanted = simplify(spoken);

  if (!wanted) {
    return null;
  }

  return (
    locations.find((location) => simplify(location.name) === wanted) ??
    locations.find((location) => {
      const name = simplify(location.name);

      return name.includes(wanted) || wanted.includes(name);
    }) ??
    null
  );
}

/**
 * 6500 -> "65", 6550 -> "65,50" (spoken Dutch style).
 */
function formatPrice(priceCents) {
  const euros = Math.floor(priceCents / 100);
  const cents = priceCents % 100;

  return cents === 0
    ? String(euros)
    : `${euros},${String(cents).padStart(2, "0")}`;
}

class AssistantMassageService {
  /**
   * Caller profile with upcoming appointments.
   */
  async getCallerProfile({ businessId, phoneNumber }) {
    const business = await this.#getBusiness(businessId);

    let normalizedPhone;

    try {
      normalizedPhone = normalizePhoneNumber(phoneNumber);
    } catch {
      // A hidden or invalid caller number: treat as unknown.
      return {
        customerFound: false,
        customer: null,
        upcomingAppointments: [],
      };
    }

    const customer = await customerService.findByPhoneNumber({
      businessId,
      phoneNumber: normalizedPhone,
    });

    if (!customer) {
      return {
        customerFound: false,
        customer: null,
        upcomingAppointments: [],
      };
    }

    const upcoming =
      await massageAppointmentRepository.findUpcomingByPhone(
        businessId,
        normalizedPhone,
        new Date()
      );

    return {
      customerFound: true,
      customer: {
        firstName: customer.firstName,
        lastName: customer.lastName,
        notes: customer.notes,
      },
      upcomingAppointments: upcoming.map((appointment) =>
        this.#toAppointment(appointment, business)
      ),
    };
  }

  /**
   * The massages the business offers.
   */
  async getServices({ businessId }) {
    await this.#getBusiness(businessId);

    const [services, locations] = await Promise.all([
      massageServiceRepository.findAllForBusiness(businessId),
      this.#findLocations(businessId),
    ]);

    return {
      ...(locations.length > 0
        ? {
            locations: locations.map((location) => ({
              name: location.name,
              massageServiceIds: location.serviceIds,
            })),
            locationInstruction: `Deze praktijk werkt op ${locations.length} locaties: ${locations
              .map((location) => location.name)
              .join(" en ")}. Vraag de klant op welke locatie hij wil komen, en geef die locatie mee aan Massage_checkAvailability en Massage_createAppointment.`,
          }
        : {}),
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        durationMinutes: service.durationMinutes,
        price: formatPrice(service.priceCents),
        currency: service.currency,
      })),
    };
  }

  /**
   * Free times of a day for one massage. When the caller
   * asked for a specific time that is not free, suggests
   * the nearest free times that day and the same time on
   * the next days; when the day is full, the next days with
   * room.
   */
  async checkAvailability({
    businessId,
    massageServiceId,
    date,
    time,
    location,
  }) {
    const business = await this.#getBusiness(businessId);

    const locations = await this.#findLocations(businessId);

    const chosen = location
      ? this.#resolveLocation(locations, location)
      : null;

    if (chosen && !chosen.serviceIds.includes(massageServiceId)) {
      return {
        date,
        weekday: weekdayOf(date),
        ...this.#notOfferedAt(chosen, locations, massageServiceId),
      };
    }

    const service =
      await massageAvailabilityService.getBookableService(
        businessId,
        massageServiceId
      );

    // Catch up external calendars if the server slept.
    await calendarSyncService.refreshIfStale(businessId);

    const targets = this.#targetsFor(
      locations,
      chosen,
      massageServiceId
    );

    const perTarget = await Promise.all(
      targets.map((target) =>
        this.#timesOn(business, service, date, target)
      )
    );

    const availableTimes = [...new Set(perTarget.flat())].sort();

    const result = {
      date,
      weekday: weekdayOf(date),
      ...(chosen ? { location: chosen.name } : {}),
      durationMinutes: service.durationMinutes,
      anyAvailability: availableTimes.length > 0,
      availableTimes,
    };

    // Several locations and the caller did not choose yet:
    // the free times per location, so the assistant can
    // ask where the caller wants to come. Each location is
    // asked on its own: in a combined list a time that is
    // free at two locations would only name one.
    if (!chosen && locations.length > 0) {
      result.availableTimesByLocation = Object.fromEntries(
        targets.map((target, index) => [
          target.name,
          perTarget[index],
        ])
      );
      result.locationInstruction =
        "Vraag de klant op welke locatie hij wil komen voordat je een afspraak maakt.";
    }

    const searchFrom = nextDate(date);

    // The day is full: the next days with room.
    if (!result.anyAvailability) {
      result.nextDaysWithAvailability = await this.#searchDays({
        business,
        service,
        targets,
        dates: searchDates(searchFrom, DEFAULT_SEARCH_DAYS),
        pick: (times) => spreadTimes(times, 3),
        limit: 3,
      });
      result.instruction =
        result.nextDaysWithAvailability.length > 0
          ? "Op die dag lukt het niet. Is de locatie die dag gesloten (zie de openingsuren), zeg dat; anders zeg je dat er die dag geen plaats meer is. Stel meteen de eerstvolgende dag uit nextDaysWithAvailability voor, met één of twee uren."
          : "Op die dag en de volgende twee weken lukt het niet.";
    }

    if (time === undefined) {
      return result;
    }

    result.requestedTime = time;
    result.requestedTimeAvailable = availableTimes.includes(time);
    result.alternativeTimes = nearestTimes(
      availableTimes,
      time,
      MAX_ALTERNATIVE_TIMES
    );

    // The requested time does not work: the same time on
    // the next days, for "is there another day at 17:00?".
    if (!result.requestedTimeAvailable) {
      result.sameTimeOnOtherDays = await this.#searchDays({
        business,
        service,
        targets,
        dates: searchDates(searchFrom, DEFAULT_SEARCH_DAYS),
        pick: (times) => (times.includes(time) ? [time] : []),
        limit: 3,
      });

      if (result.anyAvailability) {
        result.instruction =
          "Het gevraagde uur lukt niet. Stel eerst het dichtstbijzijnde uur uit alternativeTimes voor op dezelfde dag. Wil de klant liever hetzelfde uur, stel dan een dag uit sameTimeOnOtherDays voor.";
      }
    }

    return result;
  }

  /**
   * Searches free times over several days for one massage:
   * the same time on other days, a part of the day or a
   * weekday, or simply the first free moments.
   *
   * time: "HH:mm", only days where that time is free.
   * partOfDay: "ochtend", "middag" or "avond".
   * weekday: only that weekday ("woensdag").
   */
  async findAvailability({
    businessId,
    massageServiceId,
    location,
    fromDate,
    days,
    time,
    partOfDay,
    weekday,
  }) {
    const business = await this.#getBusiness(businessId);

    const locations = await this.#findLocations(businessId);

    const chosen = location
      ? this.#resolveLocation(locations, location)
      : null;

    const today = todayIn(business.timezone);

    const from = fromDate && fromDate > today ? fromDate : today;

    if (chosen && !chosen.serviceIds.includes(massageServiceId)) {
      return {
        searchedFrom: from,
        ...this.#notOfferedAt(chosen, locations, massageServiceId),
      };
    }

    const service =
      await massageAvailabilityService.getBookableService(
        businessId,
        massageServiceId
      );

    await calendarSyncService.refreshIfStale(businessId);

    const count = Math.min(
      Math.max(days ?? DEFAULT_SEARCH_DAYS, 1),
      MAX_SEARCH_DAYS
    );

    const dates = searchDates(from, count, parseWeekday(weekday));

    const results = await this.#searchDays({
      business,
      service,
      targets: this.#targetsFor(locations, chosen, massageServiceId),
      dates,
      pick: (times) =>
        time
          ? times.includes(time)
            ? [time]
            : []
          : spreadTimes(inPartOfDay(times, partOfDay), 4),
      limit: 4,
    });

    return {
      massage: service.name,
      durationMinutes: service.durationMinutes,
      ...(chosen ? { location: chosen.name } : {}),
      searchedFrom: from,
      searchedUntil: dates.at(-1) ?? from,
      ...(time ? { requestedTime: time } : {}),
      ...(partOfDay ? { partOfDay } : {}),
      ...(weekday ? { weekday } : {}),
      anyAvailability: results.length > 0,
      results,
      instruction:
        results.length > 0
          ? "Stel de klant de eerste één of twee mogelijkheden voor, met dag en uur. Lees niet de hele lijst voor."
          : "In deze periode is er geen plaats. Stel voor om verder in de tijd te zoeken of een ander uur of dagdeel te kiezen.",
    };
  }

  /**
   * Takes a callback request: for a treatment the
   * practitioner plans herself after a personal talk (Body
   * Dearmouring), or anything else the assistant cannot
   * settle. The call shows at once as "Terugbellen" in the
   * app with the reason, the business gets a push, and the
   * caller is added to the customers when the name is known.
   */
  async requestCallback({
    businessId,
    callId,
    phoneNumber,
    firstName,
    lastName,
    treatment,
    location,
    message,
  }) {
    await this.#getBusiness(businessId);

    let callerNumber = null;

    try {
      callerNumber = normalizePhoneNumber(phoneNumber);
    } catch {
      callerNumber = null;
    }

    const name = [firstName, lastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" ");

    if (callerNumber && firstName && lastName) {
      await customerService.syncCustomer({
        businessId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber: callerNumber,
      });
    }

    const reason = [
      treatment ? `Wil een ${treatment}` : "Wil teruggebeld worden",
      location ? `(${location})` : null,
    ]
      .filter(Boolean)
      .join(" ")
      .concat(message ? `. ${message.trim()}` : "");

    await insightsService.recordCallbackRequest({
      businessId,
      callId,
      callerNumber,
      callerName: name || null,
      reason,
    });

    return {
      message: "Callback request saved. The practitioner has been notified and will call back.",
      callbackRequested: true,
      callerNumberKnown: Boolean(callerNumber),
    };
  }

  /**
   * Books a massage by phone.
   */
  async createAppointment({
    businessId,
    massageServiceId,
    startTime,
    firstName,
    lastName,
    phoneNumber,
    notes,
    location,
  }) {
    const business = await this.#getBusiness(businessId);

    const locations = await this.#findLocations(businessId);

    let roomId;

    if (locations.length > 0) {
      if (!location) {
        throw new ValidationError(
          `Ask the caller which location: ${locations
            .map((candidate) => candidate.name)
            .join(" or ")}. Then pass it as location.`,
          ErrorCodes.LOCATION_REQUIRED
        );
      }

      roomId = this.#resolveLocation(locations, location).id;
    }

    const appointment = await massageAppointmentService.create(
      businessId,
      {
        roomId,
        massageServiceId,
        startTime: localDateTimeStringToUTC(
          startTime,
          business.timezone
        ).toISOString(),
        firstName,
        lastName,
        phoneNumber,
        notes,
        source: "AI",
      }
    );

    void pushService.notifyNewAppointment(
      business,
      appointment,
      "AI"
    );

    return {
      message: "Appointment created successfully.",
      appointment: this.#toAppointment(appointment, business),
    };
  }

  /**
   * Moves an appointment of the caller.
   */
  async rescheduleAppointment({
    businessId,
    appointmentId,
    phoneNumber,
    startTime,
  }) {
    const business = await this.#getBusiness(businessId);

    await this.#getOwnAppointment(
      businessId,
      appointmentId,
      phoneNumber
    );

    const appointment =
      await massageAppointmentService.reschedule(
        businessId,
        appointmentId,
        localDateTimeStringToUTC(
          startTime,
          business.timezone
        ).toISOString()
      );

    return {
      message: "Appointment rescheduled successfully.",
      appointment: this.#toAppointment(appointment, business),
    };
  }

  /**
   * Cancels an appointment of the caller.
   */
  async cancelAppointment({
    businessId,
    appointmentId,
    phoneNumber,
  }) {
    const business = await this.#getBusiness(businessId);

    await this.#getOwnAppointment(
      businessId,
      appointmentId,
      phoneNumber
    );

    const appointment = await massageAppointmentService.update(
      businessId,
      appointmentId,
      { status: "CANCELLED" }
    );

    return {
      message: "Appointment cancelled successfully.",
      appointment: this.#toAppointment(appointment, business),
    };
  }

  // ----------------------------------------------------
  // Helpers
  // ----------------------------------------------------

  /**
   * Active locations of the practice (rooms with their
   * own hours): [{ id, name, serviceIds }]. Empty when the
   * practice works at one place.
   */
  async #findLocations(businessId) {
    const rooms =
      await treatmentRoomRepository.findAllForBusiness(
        businessId
      );

    return rooms
      .filter((room) => room.hasOwnHours)
      .map((room) => ({
        id: room.id,
        name: room.name,
        serviceIds: room.services.map(
          (link) => link.massageServiceId
        ),
      }));
  }

  /**
   * What to search: the chosen location, every location
   * that gives the massage, or the whole practice (null)
   * when it works at one place.
   */
  #targetsFor(locations, chosen, massageServiceId) {
    if (chosen) {
      return [chosen];
    }

    if (locations.length === 0) {
      return [null];
    }

    return locations.filter((candidate) =>
      candidate.serviceIds.includes(massageServiceId)
    );
  }

  /**
   * The free start times ("HH:mm") of one day at one target.
   */
  async #timesOn(business, service, date, target) {
    const slots = await massageAvailabilityService.computeSlots({
      business,
      service,
      date,
      roomId: target?.id,
    });

    return [
      ...new Set(slots.map((slot) => minutesToTime(slot.minutes))),
    ];
  }

  /**
   * Walks the dates in order and keeps, per target, the
   * days where pick(times) gives something, until limit
   * days per target. Returns [{ date, weekday, location?,
   * times }] in date order.
   */
  async #searchDays({ business, service, targets, dates, pick, limit }) {
    const found = targets.map(() => []);

    for (const date of dates) {
      if (found.every((days) => days.length >= limit)) {
        break;
      }

      const perTarget = await Promise.all(
        targets.map((target, index) =>
          found[index].length >= limit
            ? []
            : this.#timesOn(business, service, date, target)
        )
      );

      perTarget.forEach((times, index) => {
        const picked = times.length > 0 ? pick(times) : [];

        if (picked.length > 0 && found[index].length < limit) {
          found[index].push({
            date,
            weekday: weekdayOf(date),
            ...(targets[index]
              ? { location: targets[index].name }
              : {}),
            times: picked,
          });
        }
      });
    }

    return found
      .flat()
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          (a.location ?? "").localeCompare(b.location ?? "")
      );
  }

  /**
   * The massage is not given at the chosen location: say
   * so, instead of "nothing free" (which sounds booked).
   */
  #notOfferedAt(chosen, locations, massageServiceId) {
    const offeredAt = locations
      .filter((candidate) =>
        candidate.serviceIds.includes(massageServiceId)
      )
      .map((candidate) => candidate.name);

    return {
      location: chosen.name,
      massageOfferedAtLocation: false,
      offeredAt,
      anyAvailability: false,
      availableTimes: [],
      instruction:
        offeredAt.length > 0
          ? `Deze massage wordt niet gegeven bij ${chosen.name}, alleen bij ${offeredAt.join(" en ")}. Zeg dat en vraag of de klant daar wil komen of een andere massage kiest.`
          : `Deze massage wordt niet gegeven bij ${chosen.name}.`,
    };
  }

  #resolveLocation(locations, spoken) {
    const location = matchLocation(locations, spoken);

    if (!location) {
      throw new ValidationError(
        locations.length > 0
          ? `Unknown location "${spoken}". The locations are: ${locations
              .map((candidate) => candidate.name)
              .join(", ")}.`
          : "This practice has only one location; leave location out.",
        ErrorCodes.LOCATION_NOT_FOUND
      );
    }

    return location;
  }

  /**
   * The appointment, only when it belongs to the caller.
   * Any mismatch looks like "not found".
   */
  async #getOwnAppointment(
    businessId,
    appointmentId,
    phoneNumber
  ) {
    const appointment =
      await massageAppointmentRepository.findById(
        appointmentId,
        businessId
      );

    let callerPhone = null;

    try {
      callerPhone = normalizePhoneNumber(phoneNumber);
    } catch {
      callerPhone = null;
    }

    if (
      !appointment ||
      callerPhone === null ||
      appointment.phoneNumber !== callerPhone
    ) {
      throw new NotFoundError(
        "Appointment not found.",
        ErrorCodes.APPOINTMENT_NOT_FOUND
      );
    }

    return appointment;
  }

  /**
   * What the assistant needs to say about an appointment.
   * The therapist and room are not included: customers
   * cannot choose them.
   */
  #toAppointment(appointment, business) {
    const start = new Date(appointment.startTime);
    const end = new Date(appointment.endTime);

    return {
      id: appointment.id,
      status: appointment.status,
      startTime: utcToLocalDateTimeString(
        start,
        business.timezone
      ),
      endTime: utcToLocalDateTimeString(
        end,
        business.timezone
      ),
      serviceName: appointment.serviceName,
      ...(locationOf(appointment)
        ? { location: locationOf(appointment) }
        : {}),
      durationMinutes: appointment.durationMinutes,
      price: formatPrice(appointment.priceCents),
      firstName: appointment.firstName,
      lastName: appointment.lastName,
    };
  }

  async #getBusiness(businessId) {
    if (!businessId) {
      throw new ValidationError(
        "Business is missing.",
        ErrorCodes.BUSINESS_NOT_FOUND
      );
    }

    const business =
      await businessRepository.findById(businessId);

    if (!business) {
      throw new NotFoundError(
        "Business not found.",
        ErrorCodes.BUSINESS_NOT_FOUND
      );
    }

    if (business.businessType !== "MASSAGE") {
      throw new ValidationError(
        "This business is not a massage business.",
        ErrorCodes.WRONG_BUSINESS_TYPE
      );
    }

    return business;
  }
}

export default new AssistantMassageService();
