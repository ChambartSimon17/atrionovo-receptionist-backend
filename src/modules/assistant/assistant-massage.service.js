import businessRepository from "../business/business.repository.js";
import customerService from "../customer/customer.service.js";
import massageServiceRepository from "../massage-service/massage-service.repository.js";
import massageAppointmentRepository from "../massage-appointment/massage-appointment.repository.js";
import massageAppointmentService from "../massage-appointment/massage-appointment.service.js";
import massageAvailabilityService from "../massage-appointment/massage-availability.service.js";
import treatmentRoomRepository from "../treatment-room/treatment-room.repository.js";
import pushService from "../insights/push.service.js";
import NotFoundError from "../../errors/NotFoundError.js";
import ValidationError from "../../errors/ValidationError.js";
import { ErrorCodes } from "../../errors/error-codes.js";
import { normalizePhoneNumber } from "../../utils/phone.utils.js";
import {
  localDateTimeStringToUTC,
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

function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
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
   * asked for a specific time, says whether it is free and
   * suggests the nearest free times.
   */
  async checkAvailability({
    businessId,
    massageServiceId,
    date,
    time,
    location,
  }) {
    await this.#getBusiness(businessId);

    const locations = await this.#findLocations(businessId);

    const chosen = location
      ? this.#resolveLocation(locations, location)
      : null;

    // The massage is not given at the chosen location: say
    // so, instead of "nothing free" (which sounds booked).
    if (chosen && !chosen.serviceIds.includes(massageServiceId)) {
      const offeredAt = locations
        .filter((candidate) =>
          candidate.serviceIds.includes(massageServiceId)
        )
        .map((candidate) => candidate.name);

      return {
        date,
        location: chosen.name,
        massageOfferedAtLocation: false,
        offeredAt,
        anyAvailability: false,
        availableTimes: [],
        instruction: offeredAt.length > 0
          ? `Deze massage wordt niet gegeven bij ${chosen.name}, alleen bij ${offeredAt.join(" en ")}. Zeg dat en vraag of de klant daar wil komen of een andere massage kiest.`
          : `Deze massage wordt niet gegeven bij ${chosen.name}.`,
      };
    }

    const availability =
      await massageAvailabilityService.findSlots(businessId, {
        date,
        serviceId: massageServiceId,
        roomId: chosen?.id,
      });

    const availableTimes = [
      ...new Set(availability.slots.map((slot) => slot.time)),
    ];

    const result = {
      date,
      ...(chosen ? { location: chosen.name } : {}),
      durationMinutes: availability.durationMinutes,
      anyAvailability: availableTimes.length > 0,
      availableTimes,
    };

    // Several locations and the caller did not choose yet:
    // the free times per location, so the assistant can
    // ask where the caller wants to come.
    // Each location is asked on its own: in the combined
    // list a time that is free at two locations only names
    // one of them.
    if (!chosen && locations.length > 0) {
      const perLocation = await Promise.all(
        locations.map((candidate) =>
          massageAvailabilityService.findSlots(businessId, {
            date,
            serviceId: massageServiceId,
            roomId: candidate.id,
          })
        )
      );

      result.availableTimesByLocation = Object.fromEntries(
        locations.map((candidate, index) => [
          candidate.name,
          perLocation[index].slots.map((slot) => slot.time),
        ])
      );
      result.locationInstruction =
        "Vraag de klant op welke locatie hij wil komen voordat je een afspraak maakt.";
    }

    if (time === undefined) {
      return result;
    }

    const requestedAvailable = availableTimes.includes(time);

    const requestedMinutes = toMinutes(time);

    const alternativeTimes = availableTimes
      .filter((candidate) => candidate !== time)
      .sort(
        (a, b) =>
          Math.abs(toMinutes(a) - requestedMinutes) -
            Math.abs(toMinutes(b) - requestedMinutes) ||
          toMinutes(a) - toMinutes(b)
      )
      .slice(0, MAX_ALTERNATIVE_TIMES)
      .sort((a, b) => toMinutes(a) - toMinutes(b));

    return {
      ...result,
      requestedTime: time,
      requestedTimeAvailable: requestedAvailable,
      alternativeTimes,
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
