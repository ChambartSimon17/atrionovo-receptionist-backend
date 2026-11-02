import { DateTime } from "luxon";

import businessRepository from "../business/business.repository.js";
import massageServiceRepository from "../massage-service/massage-service.repository.js";
import massageAppointmentRepository from "../massage-appointment/massage-appointment.repository.js";
import massageAppointmentService from "../massage-appointment/massage-appointment.service.js";
import massageAvailabilityService from "../massage-appointment/massage-availability.service.js";
import { localDateOf } from "../massage-appointment/local-time.js";
import ConflictError from "../../errors/ConflictError.js";
import NotFoundError from "../../errors/NotFoundError.js";
import { ErrorCodes } from "../../errors/error-codes.js";
import { normalizePhoneNumber } from "../../utils/phone.utils.js";

// ======================================================
// Public Massage Booking Service
// ======================================================
//
// Responsibility
// Let customers of a MASSAGE business see the massages,
// find free times and book, from the business website.
//
// The business is identified by its public slug. All
// scheduling rules live in the massage-appointment module;
// this service only adds what a public, unauthenticated
// client needs:
//
// - only public information leaves the server (no
//   therapist, room or other customers)
// - bookings are limited to the next 90 days
// - one phone number can have at most 5 upcoming
//   appointments at a business, which limits spam
// ======================================================

const BOOKING_HORIZON_DAYS = 90;

const MAX_UPCOMING_APPOINTMENTS_PER_PHONE = 5;

class PublicMassageBookingService {
  /**
   * Active massages with prices, for the widget.
   */
  async getServices(slug) {
    const business = await this.#getMassageBusiness(slug);

    const services =
      await massageServiceRepository.findAllForBusiness(
        business.id
      );

    return services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      durationMinutes: service.durationMinutes,
      priceCents: service.priceCents,
      currency: service.currency,
    }));
  }

  /**
   * Free start times of a day for one massage.
   */
  async getAvailability(slug, { date, serviceId }) {
    const business = await this.#getMassageBusiness(slug);

    if (date > this.#lastBookableDate(business)) {
      return {
        date,
        serviceId,
        slots: [],
      };
    }

    const availability =
      await massageAvailabilityService.findSlots(
        business.id,
        { date, serviceId }
      );

    return {
      date: availability.date,
      serviceId: availability.serviceId,
      durationMinutes: availability.durationMinutes,
      slots: availability.slots,
    };
  }

  /**
   * Books a massage. Returns only what the customer needs
   * for the confirmation screen.
   */
  async createAppointment(slug, data) {
    const business = await this.#getMassageBusiness(slug);

    const startTime = new Date(data.startTime);

    if (
      localDateOf(startTime, business.timezone) >
      this.#lastBookableDate(business)
    ) {
      throw new ConflictError(
        "This time is not available for online booking.",
        ErrorCodes.APPOINTMENT_NOT_AVAILABLE
      );
    }

    const upcoming =
      await massageAppointmentRepository.countUpcomingByPhone(
        business.id,
        normalizePhoneNumber(data.phoneNumber),
        new Date()
      );

    if (upcoming >= MAX_UPCOMING_APPOINTMENTS_PER_PHONE) {
      throw new ConflictError(
        "You already have several upcoming appointments. Please call us to book more.",
        ErrorCodes.TOO_MANY_UPCOMING_APPOINTMENTS
      );
    }

    const appointment =
      await massageAppointmentService.create(
        business.id,
        data
      );

    return {
      id: appointment.id,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      serviceName: appointment.serviceName,
      durationMinutes: appointment.durationMinutes,
      priceCents: appointment.priceCents,
      firstName: appointment.firstName,
      lastName: appointment.lastName,
    };
  }

  /**
   * The last day (YYYY-MM-DD, business time) that can be
   * booked online.
   */
  #lastBookableDate(business) {
    return DateTime.now()
      .setZone(business.timezone)
      .plus({ days: BOOKING_HORIZON_DAYS })
      .toISODate();
  }

  async #getMassageBusiness(slug) {
    const business =
      await businessRepository.findBySlug(slug);

    // A restaurant gets the same answer as an unknown slug.
    if (
      !business ||
      business.businessType !== "MASSAGE"
    ) {
      throw new NotFoundError(
        "Business not found.",
        ErrorCodes.BUSINESS_NOT_FOUND
      );
    }

    return business;
  }
}

export default new PublicMassageBookingService();
