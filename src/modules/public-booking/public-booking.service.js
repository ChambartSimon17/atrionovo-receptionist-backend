import businessRepository from "../business/business.repository.js";
import reservationService from "../reservation/reservation.service.js";
import NotFoundError from "../../errors/NotFoundError.js";
import { ErrorCodes } from "../../errors/error-codes.js";
import {
  localDateTimeToUTC,
} from "../../utils/time.utils.js";

// ======================================================
// Public Booking Service
// ======================================================
//
// Responsibility
// Handle booking operations coming from business
// websites.
//
// This service is intentionally thin.
//
// The actual reservation business logic remains inside
// ReservationService.
// ======================================================

class PublicBookingService {

  /**
   * Finds a business by its public slug and returns
   * only information that is safe for the website widget.
   */
  async getBusiness(slug) {
    const business =
      await businessRepository.findBySlug(
        slug
      );

    if (!business) {
      throw new NotFoundError(
        "Business not found.",
        ErrorCodes.BUSINESS_NOT_FOUND
      );
    }

    return {
      name: business.name,

      slug: business.slug,

      timezone: business.timezone,

      language: business.language,

      maxReservationSize:
        business.maxReservationSize,

      arrivalIntervalMinutes:
        business.arrivalIntervalMinutes,

      defaultReservationDurationMinutes:
        business.defaultReservationDurationMinutes,
    };
  }

  /**
   * Checks availability for a public website booking.
   */
  async checkAvailability(
    slug,
    bookingData
  ) {
    const business =
      await businessRepository.findBySlug(
        slug
      );

    if (!business) {
      throw new NotFoundError(
        "Business not found.",
        ErrorCodes.BUSINESS_NOT_FOUND
      );
    }

    const startTime =
      localDateTimeToUTC(
        bookingData.date,
        bookingData.time,
        business.timezone
      );

    return reservationService.checkAvailability({
      businessId:
        business.id,

      guestCount:
        bookingData.guestCount,

      startTime,
    });
  }

  /**
   * Creates a reservation from a public website.
   *
   * The business ID is resolved server-side from
   * the business slug.
   */
  async createReservation(
    slug,
    reservationData
  ) {
    const business =
      await businessRepository.findBySlug(
        slug
      );

    if (!business) {
      throw new NotFoundError(
        "Business not found.",
        ErrorCodes.BUSINESS_NOT_FOUND
      );
    }

    const startTime =
      localDateTimeToUTC(
        reservationData.date,
        reservationData.time,
        business.timezone
      );

    return reservationService.createReservation({
      businessId:
        business.id,

      firstName:
        reservationData.firstName,

      lastName:
        reservationData.lastName,

      phoneNumber:
        reservationData.phoneNumber,

      email:
        reservationData.email,

      guestCount:
        reservationData.guestCount,

      startTime,

      notes:
        reservationData.notes,
    });
  }
}

export default new PublicBookingService();