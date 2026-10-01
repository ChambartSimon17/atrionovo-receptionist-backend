import restaurantRepository from "../restaurant/restaurant.repository.js";
import reservationRepository from "../reservation/reservation.repository.js";
import openingScheduleService from "../restaurant/opening-schedule/opening-schedule.service.js";
import tableAssignmentService from "../restaurant/table/table-assignment.service.js";
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
// This service evaluates restaurant business rules
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
// - Restaurant exists
// - Reservation falls within opening hours
// - Reservation starts on a valid arrival interval
// - Reservation does not exceed the restaurant's
//   maximum reservation size
// - Restaurant has sufficient capacity
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
    restaurantId,
    guestCount,
    startTime,
    endTime,
    ignoreReservationId,
  }) {
    const restaurant =
      await this.#getRestaurant(
        restaurantId
      );

    await this.#validateOpeningHours({
      restaurant,
      startTime,
      endTime,
    });

    this.#validateArrivalInterval({
      restaurant,
      startTime,
    });

    this.#validateReservationSize({
      restaurant,
      guestCount,
    });

    await this.#validateCapacity({
      restaurant,
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
   * Performs the authoritative restaurant capacity check.
   *
   * This method is intended to run inside the reservation
   * transaction during creation or update.
   *
   * The transaction client is passed to the repository so
   * the capacity read participates in the same transaction
   * as the reservation write.
   */
  async checkCapacity({
    restaurantId,
    guestCount,
    startTime,
    endTime,
    ignoreReservationId,
    db,
  }) {
    const restaurant =
      await this.#getRestaurant(
        restaurantId,
        db
      );

    await this.#validateCapacity({
      restaurant,
      guestCount,
      startTime,
      endTime,
      ignoreReservationId,
      db,
    });
  }

  async findOpeningPeriodsForDate({
    restaurantId,
    date,
  }) {
    const restaurant =
      await this.#getRestaurant(
        restaurantId
      );

    const reservationDate =
      new Date(`${date}T12:00:00`);

    return openingScheduleService.findOpeningPeriods(
      restaurant,
      reservationDate
    );
  }

  /**
   * Finds all available reservation start times
   * for a specific restaurant date and guest count.
   *
   * The date and time are interpreted in the
   * restaurant's timezone.
   *
   * Every candidate is checked using the exact same
   * eligibility rules used when creating a reservation.
   */
  async findAvailableSlotsForDate({
    restaurantId,
    date,
    guestCount,
  }) {
    const restaurant =
      await this.#getRestaurant(
        restaurantId
      );

    const openingPeriods =
      await this.findOpeningPeriodsForDate({
        restaurantId,
        date,
      });

    if (openingPeriods.length === 0) {
      return [];
    }

    const slots = [];

    const reservationDuration =
      restaurant.defaultReservationDurationMinutes;

    for (const openingPeriod of openingPeriods) {
      const firstStart =
        openingPeriod.opensAtMinutes;

      const lastStart =
        openingPeriod.closesAtMinutes -
        reservationDuration;

      for (
        let minutes = firstStart;
        minutes <= lastStart;
        minutes += restaurant.arrivalIntervalMinutes
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
              zone: restaurant.timezone,
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
            restaurantId,
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
    restaurantId,
    guestCount,
    startTime,
    endTime,
    ignoreReservationId,
    maxResults = 3,
    searchSteps = 6,
  }) {
    const restaurant =
      await this.#getRestaurant(
        restaurantId
      );

    const requestedStart =
      new Date(startTime);

    const requestedEnd =
      new Date(endTime);

    const reservationDuration =
      requestedEnd.getTime() -
      requestedStart.getTime();

    const intervalMinutes =
      restaurant.arrivalIntervalMinutes;

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
          restaurantId,
          guestCount,
          startTime: candidate.startTime,
          endTime: candidate.endTime,
          ignoreReservationId,
        });

        const tableAssignment =
          await tableAssignmentService.assignTables({
            restaurantId,
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
   * Retrieves the restaurant.
   *
   * Uses the provided database client when called
   * from inside a transaction.
   */
  async #getRestaurant(
    restaurantId,
    db
  ) {
    const restaurant =
      await restaurantRepository.findById(
        restaurantId,
        db
      );

    if (!restaurant) {
      throw new NotFoundError(
        "Restaurant not found.",
        ErrorCodes.RESTAURANT_NOT_FOUND
      );
    }

    return restaurant;
  }

  /**
   * Ensures the reservation fits completely inside
   * one opening period of the restaurant.
   */
  async #validateOpeningHours({
    restaurant,
    startTime,
    endTime,
  }) {
    const reservationStart =
      new Date(startTime);

    const reservationEnd =
      new Date(endTime);

    const openingHours =
      await openingScheduleService.findOpeningPeriods(
        restaurant,
        reservationStart
      );

    if (openingHours.length === 0) {
      throw new ValidationError(
        "Restaurant is closed on this day.",
        ErrorCodes.RESTAURANT_CLOSED
      );
    }

    // Reservations may not span multiple local days.
    const formatter =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone:
            restaurant.timezone,
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
        restaurant.timezone
      );

    const endMinutes =
      dateToMinutes(
        reservationEnd,
        restaurant.timezone
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
   * restaurant's allowed arrival intervals.
   */
  #validateArrivalInterval({
    restaurant,
    startTime,
  }) {
    const reservationStart =
      new Date(startTime);

    const startMinutes =
      dateToMinutes(
        reservationStart,
        restaurant.timezone
      );

    if (
      startMinutes %
        restaurant.arrivalIntervalMinutes !==
      0
    ) {
      throw new ValidationError(
        `Reservations must start every ${restaurant.arrivalIntervalMinutes} minutes.`,
        ErrorCodes.INVALID_ARRIVAL_INTERVAL
      );
    }
  }

  /**
   * Ensures the reservation does not exceed
   * the restaurant's maximum reservation size.
   */
  #validateReservationSize({
    restaurant,
    guestCount,
  }) {
    if (
      guestCount >
      restaurant.maxReservationSize
    ) {
      throw new ValidationError(
        `Maximum reservation size is ${restaurant.maxReservationSize}.`,
        ErrorCodes.MAX_RESERVATION_SIZE_EXCEEDED
      );
    }
  }

  /**
   * Ensures the restaurant has enough
   * remaining capacity.
   *
   * When db is provided, the overlapping reservation
   * query executes through that database client.
   * This allows the method to participate in the
   * surrounding SERIALIZABLE transaction.
   */
  async #validateCapacity({
    restaurant,
    guestCount,
    startTime,
    endTime,
    ignoreReservationId,
    db,
  }) {
    let reservations =
      await reservationRepository.findOverlappingReservations(
        restaurant.id,
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
      restaurant.maxCapacity
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