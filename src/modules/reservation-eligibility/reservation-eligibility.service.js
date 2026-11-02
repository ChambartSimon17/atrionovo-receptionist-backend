import businessRepository from "../business/business.repository.js";
import reservationRepository from "../reservation/reservation.repository.js";
import openingScheduleService from "../business/opening-schedule/opening-schedule.service.js";
import tableAssignmentService from "../business/table/table-assignment.service.js";
import { dateToMinutes } from "../../utils/time.utils.js";
import NotFoundError from "../../errors/NotFoundError.js";
import ValidationError from "../../errors/ValidationError.js";
import { ErrorCodes } from "../../errors/error-codes.js";
import { DateTime } from "luxon";

// ======================================================
// Reservation Eligibility Service
// ======================================================
//
// Responsibility
// Determine whether a reservation can be accepted.
//
// This service evaluates business rules
// before a reservation is created.
//
// Concurrency
// Capacity can be checked in two contexts:
//
// 1. Normal eligibility checks
//    - Uses the normal Prisma client.
//    - Used for availability checks and fast
//      pre-validation.
//
// 2. Authoritative capacity checks
//    - Uses the transaction client when provided.
//    - Used during reservation creation/update.
//    - Must execute inside the same SERIALIZABLE
//      transaction as table assignment and reservation
//      creation/update.
//
// Current Rules
// - Business exists
// - Reservation falls within opening hours
// - Reservation starts on a valid arrival interval
// - Reservation does not exceed the business's
//   maximum reservation size
// - Business has sufficient capacity
//
// Alternative Slot Rules
// - Search nearby valid arrival times
// - Reuse the exact same eligibility rules
// - Return the closest available slots
// - Never return invalid reservation times
// ======================================================

class ReservationEligibilityService {
  /**
   * Determines whether a reservation can be accepted.
   *
   * Throws a business error when one of the
   * eligibility rules is violated.
   */
  async checkEligibility({
    businessId,
    guestCount,
    startTime,
    endTime,
    ignoreReservationId,
  }) {
    const business =
      await this.#getBusiness(
        businessId
      );

    await this.#validateOpeningHours({
      business,
      startTime,
      endTime,
    });

    this.#validateArrivalInterval({
      business,
      startTime,
    });

    this.#validateReservationSize({
      business,
      guestCount,
    });

    await this.#validateCapacity({
      business,
      guestCount,
      startTime,
      endTime,
      ignoreReservationId,
    });

    return {
      eligible: true,
    };
  }

  /**
   * Performs the authoritative business capacity check.
   *
   * This method is intended to run inside the reservation
   * transaction during creation or update.
   *
   * The transaction client is passed to the repository so
   * the capacity read participates in the same transaction
   * as the reservation write.
   */
  async checkCapacity({
    businessId,
    guestCount,
    startTime,
    endTime,
    ignoreReservationId,
    db,
  }) {
    const business =
      await this.#getBusiness(
        businessId,
        db
      );

    await this.#validateCapacity({
      business,
      guestCount,
      startTime,
      endTime,
      ignoreReservationId,
      db,
    });
  }

  async findOpeningPeriodsForDate({
    businessId,
    date,
  }) {
    const business =
      await this.#getBusiness(
        businessId
      );

    const reservationDate =
      new Date(`${date}T12:00:00`);

    return openingScheduleService.findOpeningPeriods(
      business,
      reservationDate
    );
  }

  /**
   * Finds all available reservation start times
   * for a specific business date and guest count.
   *
   * The date and time are interpreted in the
   * business's timezone.
   *
   * Every candidate is checked using the exact same
   * eligibility rules used when creating a reservation.
   */
  async findAvailableSlotsForDate({
    businessId,
    date,
    guestCount,
  }) {
    const business =
      await this.#getBusiness(
        businessId
      );

    const openingPeriods =
      await this.findOpeningPeriodsForDate({
        businessId,
        date,
      });

    if (openingPeriods.length === 0) {
      return [];
    }

    const slots = [];

    const reservationDuration =
      business.defaultReservationDurationMinutes;

    for (const openingPeriod of openingPeriods) {
      const firstStart =
        openingPeriod.opensAtMinutes;

      const lastStart =
        openingPeriod.closesAtMinutes -
        reservationDuration;

      for (
        let minutes = firstStart;
        minutes <= lastStart;
        minutes += business.arrivalIntervalMinutes
      ) {
        const hour =
          Math.floor(minutes / 60);

        const minute =
          minutes % 60;

        const time =
          `${String(hour).padStart(2, "0")}:${String(
            minute
          ).padStart(2, "0")}`;

        const startDateTime =
          DateTime.fromISO(
            `${date}T${time}`,
            {
              zone: business.timezone,
            }
          );

        const endDateTime =
          startDateTime.plus({
            minutes:
              reservationDuration,
          });

        const startTime =
          startDateTime.toJSDate();

        const endTime =
          endDateTime.toJSDate();

        try {
          await this.checkEligibility({
            businessId,
            guestCount,
            startTime,
            endTime,
          });

          slots.push({
            startTime,
            endTime,
          });
        } catch (error) {
          if (
            error instanceof ValidationError
          ) {
            continue;
          }

          throw error;
        }
      }
    }

    return slots;
  }

  /**
   * Finds nearby available reservation slots.
   *
   * Every candidate is checked using the same
   * eligibility rules as a normal reservation.
   *
   * The closest available slots are returned first.
   */
  async findAlternativeSlots({
    businessId,
    guestCount,
    startTime,
    endTime,
    ignoreReservationId,
    maxResults = 3,
    searchSteps = 6,
  }) {
    const business =
      await this.#getBusiness(
        businessId
      );

    const requestedStart =
      new Date(startTime);

    const requestedEnd =
      new Date(endTime);

    const reservationDuration =
      requestedEnd.getTime() -
      requestedStart.getTime();

    const intervalMinutes =
      business.arrivalIntervalMinutes;

    const candidates = [];

    for (
      let step = 1;
      step <= searchSteps;
      step++
    ) {
      const offsetMinutes =
        step * intervalMinutes;

      const earlierStart =
        new Date(
          requestedStart.getTime() -
            offsetMinutes * 60 * 1000
        );

      const earlierEnd =
        new Date(
          earlierStart.getTime() +
            reservationDuration
        );

      const laterStart =
        new Date(
          requestedStart.getTime() +
            offsetMinutes * 60 * 1000
        );

      const laterEnd =
        new Date(
          laterStart.getTime() +
            reservationDuration
        );

      candidates.push({
        startTime: earlierStart,
        endTime: earlierEnd,
        distance: offsetMinutes,
      });

      candidates.push({
        startTime: laterStart,
        endTime: laterEnd,
        distance: offsetMinutes,
      });
    }

    candidates.sort(
      (a, b) =>
        a.distance - b.distance
    );

    const alternatives = [];

    for (const candidate of candidates) {
      try {
        await this.checkEligibility({
          businessId,
          guestCount,
          startTime: candidate.startTime,
          endTime: candidate.endTime,
          ignoreReservationId,
        });

        const tableAssignment =
          await tableAssignmentService.assignTables({
            businessId,
            guestCount,
            startTime: candidate.startTime,
            endTime: candidate.endTime,
            ignoreReservationId,
          });

        if (!tableAssignment) {
          continue;
        }

        alternatives.push({
          startTime:
            candidate.startTime,
          endTime:
            candidate.endTime,
        });

        if (
          alternatives.length >=
          maxResults
        ) {
          break;
        }
      } catch (error) {
        if (
          error instanceof ValidationError
        ) {
          continue;
        }

        throw error;
      }
    }

    return alternatives;
  }

  /**
   * Retrieves the business.
   *
   * Uses the provided database client when called
   * from inside a transaction.
   */
  async #getBusiness(
    businessId,
    db
  ) {
    const business =
      await businessRepository.findById(
        businessId,
        db
      );

    if (!business) {
      throw new NotFoundError(
        "Business not found.",
        ErrorCodes.BUSINESS_NOT_FOUND
      );
    }

    return business;
  }

  /**
   * Ensures the reservation fits completely inside
   * one opening period of the business.
   */
  async #validateOpeningHours({
    business,
    startTime,
    endTime,
  }) {
    const reservationStart =
      new Date(startTime);

    const reservationEnd =
      new Date(endTime);

    const openingHours =
      await openingScheduleService.findOpeningPeriods(
        business,
        reservationStart
      );

    if (openingHours.length === 0) {
      throw new ValidationError(
        "Business is closed on this day.",
        ErrorCodes.BUSINESS_CLOSED
      );
    }

    // Reservations may not span multiple local days.
    const formatter =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone:
            business.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }
      );

    const startDate =
      formatter.format(
        reservationStart
      );

    const endDate =
      formatter.format(
        reservationEnd
      );

    if (startDate !== endDate) {
      throw new ValidationError(
        "Reservation cannot span multiple days.",
        ErrorCodes.RESERVATION_SPANS_MULTIPLE_DAYS
      );
    }

    const startMinutes =
      dateToMinutes(
        reservationStart,
        business.timezone
      );

    const endMinutes =
      dateToMinutes(
        reservationEnd,
        business.timezone
      );

    const fitsOpeningPeriod =
      openingHours.some(
        (openingHour) =>
          startMinutes >=
            openingHour.opensAtMinutes &&
          endMinutes <=
            openingHour.closesAtMinutes
      );

    if (!fitsOpeningPeriod) {
      throw new ValidationError(
        "Reservation falls outside opening hours.",
        ErrorCodes.OUTSIDE_OPENING_HOURS
      );
    }
  }

  /**
   * Ensures the reservation starts on one of the
   * business's allowed arrival intervals.
   */
  #validateArrivalInterval({
    business,
    startTime,
  }) {
    const reservationStart =
      new Date(startTime);

    const startMinutes =
      dateToMinutes(
        reservationStart,
        business.timezone
      );

    if (
      startMinutes %
        business.arrivalIntervalMinutes !==
      0
    ) {
      throw new ValidationError(
        `Reservations must start every ${business.arrivalIntervalMinutes} minutes.`,
        ErrorCodes.INVALID_ARRIVAL_INTERVAL
      );
    }
  }

  /**
   * Ensures the reservation does not exceed
   * the business's maximum reservation size.
   */
  #validateReservationSize({
    business,
    guestCount,
  }) {
    if (
      guestCount >
      business.maxReservationSize
    ) {
      throw new ValidationError(
        `Maximum reservation size is ${business.maxReservationSize}.`,
        ErrorCodes.MAX_RESERVATION_SIZE_EXCEEDED
      );
    }
  }

  /**
   * Ensures the business has enough
   * remaining capacity.
   *
   * When db is provided, the overlapping reservation
   * query executes through that database client.
   * This allows the method to participate in the
   * surrounding SERIALIZABLE transaction.
   */
  async #validateCapacity({
    business,
    guestCount,
    startTime,
    endTime,
    ignoreReservationId,
    db,
  }) {
    let reservations =
      await reservationRepository.findOverlappingReservations(
        business.id,
        startTime,
        endTime,
        db
      );

    if (ignoreReservationId) {
      reservations =
        reservations.filter(
          (reservation) =>
            reservation.id !==
            ignoreReservationId
        );
    }

    const occupiedSeats =
      this.#calculateOccupiedSeats(
        reservations
      );

    if (
      occupiedSeats + guestCount >
      business.maxCapacity
    ) {
      throw new ValidationError(
        "Restaurant capacity exceeded.",
        ErrorCodes.CAPACITY_EXCEEDED
      );
    }
  }

  /**
   * Calculates the total number of occupied seats
   * for the requested reservation period.
   */
  #calculateOccupiedSeats(
    reservations
  ) {
    return reservations.reduce(
      (total, reservation) =>
        total +
        reservation.guestCount,
      0
    );
  }
}

export default new ReservationEligibilityService();