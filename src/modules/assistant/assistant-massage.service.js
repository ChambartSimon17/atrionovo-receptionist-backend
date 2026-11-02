import businessRepository from "../business/business.repository.js";
import customerService from "../customer/customer.service.js";
import massageServiceRepository from "../massage-service/massage-service.repository.js";
import massageAppointmentRepository from "../massage-appointment/massage-appointment.repository.js";
import massageAppointmentService from "../massage-appointment/massage-appointment.service.js";
import massageAvailabilityService from "../massage-appointment/massage-availability.service.js";
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

    const services =
      await massageServiceRepository.findAllForBusiness(
        businessId
      );

    return {
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
  }) {
    await this.#getBusiness(businessId);

    const availability =
      await massageAvailabilityService.findSlots(businessId, {
        date,
        serviceId: massageServiceId,
      });

    const availableTimes = availability.slots.map(
      (slot) => slot.time
    );

    const result = {
      date,
      durationMinutes: availability.durationMinutes,
      anyAvailability: availableTimes.length > 0,
      availableTimes,
    };

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
  }) {
    const business = await this.#getBusiness(businessId);

    const appointment = await massageAppointmentService.create(
      businessId,
      {
        massageServiceId,
        startTime: localDateTimeStringToUTC(
          startTime,
          business.timezone
        ).toISOString(),
        firstName,
        lastName,
        phoneNumber,
        notes,
      }
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
