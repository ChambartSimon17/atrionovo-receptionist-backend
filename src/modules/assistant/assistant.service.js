import customerService from "../customer/customer.service.js";
import reservationService from "../reservation/reservation.service.js";
import reservationRepository from "../reservation/reservation.repository.js";
import businessRepository from "../business/business.repository.js";
import pushService from "../insights/push.service.js";
import reservationEligibilityService from "../reservation-eligibility/reservation-eligibility.service.js";
import tableAssignmentService from "../business/table/table-assignment.service.js";
import openingScheduleService from "../business/opening-schedule/opening-schedule.service.js";
import NotFoundError from "../../errors/NotFoundError.js";
import ValidationError from "../../errors/ValidationError.js";
import { ErrorCodes } from "../../errors/error-codes.js";
import { DateTime } from "luxon";
import {
  DEFAULT_SEARCH_DAYS,
  MAX_SEARCH_DAYS,
  parseWeekday,
  searchDates,
  spreadTimes,
  todayIn,
  weekdayOf,
} from "./massage-search.js";
import {
  candidateTimes,
  inBatches,
  seatingWindow,
} from "./restaurant-search.js";
import {
  localDateTimeStringToUTC,
  utcToLocalDateTimeString,
} from "../../utils/time.utils.js";

// ======================================================
// Assistant Service
// ======================================================
//
// Responsibility
// Provide AI-optimized endpoints.
//
// This service orchestrates existing domain services
// without implementing business logic itself.
// ======================================================

// Reasons for which another day can help. A group that is
// too large or a time off the arrival grid has nothing to
// do with the day.
const OTHER_DAY_REASONS = new Set([
  ErrorCodes.CAPACITY_EXCEEDED,
  ErrorCodes.RESERVATION_NOT_AVAILABLE,
  ErrorCodes.BUSINESS_CLOSED,
  ErrorCodes.OUTSIDE_OPENING_HOURS,
  ErrorCodes.RESERVATION_SPANS_MULTIPLE_DAYS,
]);

// How many other days the assistant hears about at once.
const OTHER_DAYS = 2;
const TIMES_PER_DAY = 3;
const MAX_DAYS_FOUND = 4;

// Parallel work per step: days at once, times per day.
const DAYS_IN_PARALLEL = 3;
const TIMES_IN_PARALLEL = 6;

class AssistantService {
  /**
   * Retrieves the caller profile.
   */
  async getCallerProfile({
    businessId,
    phoneNumber,
  }) {
    const customer =
      await customerService.findByPhoneNumber({
        businessId,
        phoneNumber,
      });

    console.log("getCallerProfile lookup result:", {
      businessId,
      phoneNumber,
      customerFound: Boolean(customer),
      customerId: customer?.id ?? null,
    });

    if (!customer) {
      return {
        customerFound: false,

        customer: null,

        upcomingReservations: [],
      };
    }

    const upcomingReservations =
      await reservationService.findUpcoming({
        businessId,
        phoneNumber,
      });

    return {
      customerFound: true,

      customer: {
        firstName: customer.firstName,
        lastName: customer.lastName,
        phoneNumber: customer.phoneNumber,
        email: customer.email,
        isVip: customer.isVip,
        notes: customer.notes,
      },

      upcomingReservations:
        upcomingReservations.map(
          (reservation) => ({
            id: reservation.id,
            startTime: reservation.startTime,
            endTime: reservation.endTime,
            guestCount: reservation.guestCount,
            status: reservation.status,
          })
        ),
    };
  }

  /**
   * Checks reservation availability.
   */
  async checkAvailability({
    businessId,
    guestCount,
    startTime,
  }) {
    const business =
      await businessRepository.findById(
        businessId
      );

    if (!business) {
      throw new NotFoundError(
        "Business not found.",
        ErrorCodes.BUSINESS_NOT_FOUND
      );
    }

    const startTimeUTC =
      localDateTimeStringToUTC(
        startTime,
        business.timezone
      );

    const result =
      await reservationService.checkAvailability({
        businessId,
        guestCount,
        startTime: startTimeUTC,
      });

    return {
      ...result,

      requestedSlot: {
        startTime,
        endTime:
          utcToLocalDateTimeString(
            result.requestedSlot.endTime,
            business.timezone
          ),
      },

      alternativeSlots:
        result.alternativeSlots.map(
          (slot) => ({
            startTime:
              utcToLocalDateTimeString(
                slot.startTime,
                business.timezone
              ),

            endTime:
              utcToLocalDateTimeString(
                slot.endTime,
                business.timezone
              ),
          })
        ),

      ...(await this.#otherDays({
        business,
        guestCount,
        startTime,
        result,
      })),
    };
  }

  /**
   * What checkAvailability adds so the assistant can
   * actively help: the weekday of the date and, when the
   * time does not work, the same time on the next days
   * and (when that evening or lunch is full) the next days
   * with room around the same time.
   */
  async #otherDays({ business, guestCount, startTime, result }) {
    const [date, clock] = startTime.split("T");

    const time = clock.slice(0, 5);

    const extra = { weekday: weekdayOf(date) };

    if (result.available || !OTHER_DAY_REASONS.has(result.reason)) {
      return extra;
    }

    const dates = searchDates(date, DEFAULT_SEARCH_DAYS + 1).slice(1);

    extra.sameTimeOnOtherDays = await this.#searchDays({
      business,
      guestCount,
      dates,
      // Only days on which that time is within the opening
      // hours: no database checks for a closed day.
      timesFor: (periods) =>
        candidateTimes({
          periods,
          durationMinutes: business.defaultReservationDurationMinutes,
          intervalMinutes: business.arrivalIntervalMinutes,
          time,
        }),
      maxDays: OTHER_DAYS,
    });

    if (result.alternativeSlots.length === 0) {
      extra.nextDaysWithAvailability = await this.#searchDays({
        business,
        guestCount,
        dates,
        timesFor: (periods) =>
          seatingWindow(
            periods,
            time,
            business.defaultReservationDurationMinutes,
            business.arrivalIntervalMinutes
          ),
        maxDays: OTHER_DAYS,
      });
    }

    return extra;
  }

  /**
   * Free arrival times over several days, for a guest who
   * wants another day ("is there room on Saturday?", "an
   * evening next week", "when can we come with eight?").
   */
  async findAvailability({
    businessId,
    guestCount,
    fromDate,
    days,
    time,
    partOfDay,
    weekday,
  }) {
    const business = await businessRepository.findById(businessId);

    if (!business) {
      throw new NotFoundError(
        "Business not found.",
        ErrorCodes.BUSINESS_NOT_FOUND
      );
    }

    const today = todayIn(business.timezone);

    const from = fromDate && fromDate > today ? fromDate : today;

    const count = Math.min(
      Math.max(days ?? DEFAULT_SEARCH_DAYS, 1),
      MAX_SEARCH_DAYS
    );

    const dates = searchDates(from, count, parseWeekday(weekday));

    const searched = {
      guestCount,
      searchedFrom: from,
      searchedUntil: searchDates(from, count).at(-1),
    };

    if (guestCount > business.maxReservationSize) {
      return {
        ...searched,
        days: [],
        reason: ErrorCodes.MAX_RESERVATION_SIZE_EXCEEDED,
      };
    }

    const found = await this.#searchDays({
      business,
      guestCount,
      dates,
      timesFor: (periods) =>
        candidateTimes({
          periods,
          durationMinutes: business.defaultReservationDurationMinutes,
          intervalMinutes: business.arrivalIntervalMinutes,
          time,
          partOfDay,
        }),
      maxDays: MAX_DAYS_FOUND,
    });

    return { ...searched, days: found, reason: null };
  }

  /**
   * Goes over dates in order and returns the first maxDays
   * days with free times: { date, weekday, times }. Which
   * times to try on a day comes from timesFor(periods).
   */
  async #searchDays({ business, guestCount, dates, timesFor, maxDays }) {
    const days = await inBatches(
      dates,
      DAYS_IN_PARALLEL,
      async (date) => {
        const periods = await this.#openingPeriods(business, date);

        const candidates = periods.length ? timesFor(periods) : [];

        const flags = await inBatches(candidates, TIMES_IN_PARALLEL, (t) =>
          this.#isFree({ business, guestCount, date, time: t })
        );

        const free = candidates.filter((_, index) => flags[index]);

        return {
          date,
          weekday: weekdayOf(date),
          times: spreadTimes(free, TIMES_PER_DAY),
        };
      },
      (results) =>
        results.filter((day) => day.times.length).length >= maxDays
    );

    return days.filter((day) => day.times.length).slice(0, maxDays);
  }

  async #openingPeriods(business, date) {
    return openingScheduleService.findOpeningPeriods(
      business,
      DateTime.fromISO(`${date}T12:00:00`, {
        zone: business.timezone,
      }).toJSDate()
    );
  }

  /**
   * The same rules as booking: opening hours, arrival
   * interval, group size, capacity and a free table
   * combination.
   */
  async #isFree({ business, guestCount, date, time }) {
    const start = DateTime.fromISO(`${date}T${time}`, {
      zone: business.timezone,
    });

    const startTime = start.toJSDate();

    const endTime = start
      .plus({ minutes: business.defaultReservationDurationMinutes })
      .toJSDate();

    try {
      await reservationEligibilityService.checkEligibility({
        businessId: business.id,
        guestCount,
        startTime,
        endTime,
      });

      const tables = await tableAssignmentService.assignTables({
        businessId: business.id,
        guestCount,
        startTime,
        endTime,
      });

      return Boolean(tables);
    } catch (error) {
      if (error instanceof ValidationError) {
        return false;
      }

      throw error;
    }
  }

  /**
   * Creates a new reservation.
   */
  async createReservation(
    reservationData
  ) {
    const business =
      await businessRepository.findById(
        reservationData.businessId
      );

    if (!business) {
      throw new NotFoundError(
        "Business not found.",
        ErrorCodes.BUSINESS_NOT_FOUND
      );
    }

    const startTimeUTC =
      localDateTimeStringToUTC(
        reservationData.startTime,
        business.timezone
      );

    const reservation =
      await reservationService.createReservation(
        {
          ...reservationData,
          startTime: startTimeUTC,
          source: "AI",
        }
      );

    void pushService.notifyNewReservation(
      business,
      reservation,
      "AI"
    );

    return {
      message:
        "Reservation created successfully.",

      customer: {
        firstName:
          reservation.firstName,

        lastName:
          reservation.lastName,

        phoneNumber:
          reservation.phoneNumber,

        email:
          reservation.email,
      },

      reservation: {
        id:
          reservation.id,

        startTime:
          utcToLocalDateTimeString(
            reservation.startTime,
            business.timezone
          ),

        endTime:
          utcToLocalDateTimeString(
            reservation.endTime,
            business.timezone
          ),

        guestCount:
          reservation.guestCount,

        status:
          reservation.status,
      },
    };
  }

  /**
   * Updates an existing reservation.
   */
  async updateReservation({
    businessId,
    reservationId,
    guestCount,
    startTime,
  }) {
    const business =
      await businessRepository.findById(
        businessId
      );

    if (!business) {
      throw new NotFoundError(
        "Business not found.",
        ErrorCodes.BUSINESS_NOT_FOUND
      );
    }

    // Only reservations of this business: a caller cannot
    // change another business's reservation by its id.
    const existingReservation =
      await this.#getOwnReservation(
        reservationId,
        businessId
      );

    const startTimeUTC =
      localDateTimeStringToUTC(
        startTime,
        business.timezone
      );

    const reservation =
      await reservationService.updateReservation(
        reservationId,
        {
          businessId,

          firstName:
            existingReservation.firstName,

          lastName:
            existingReservation.lastName,

          phoneNumber:
            existingReservation.phoneNumber,

          email:
            existingReservation.email,

          notes:
            existingReservation.notes,

          guestCount,

          startTime: startTimeUTC,
        }
      );

    return {
      message:
        "Reservation updated successfully.",

      reservation: {
        id: reservation.id,

        startTime:
          utcToLocalDateTimeString(
            reservation.startTime,
            business.timezone
          ),

        endTime:
          utcToLocalDateTimeString(
            reservation.endTime,
            business.timezone
          ),

        guestCount:
          reservation.guestCount,

        status:
          reservation.status,
      },
    };
  }

  /**
   * Cancels an existing reservation.
   */
  async cancelReservation({
    businessId,
    reservationId,
  }) {
    await this.#getOwnReservation(
      reservationId,
      businessId
    );

    const reservation =
      await reservationService.cancelReservation(
        reservationId
      );

    return {
      message:
        "Reservation cancelled successfully.",

      reservation: {
        id: reservation.id,

        status:
          reservation.status,
      },
    };
  }

  async #getOwnReservation(reservationId, businessId) {
    const reservation = businessId
      ? await reservationRepository.findByIdForBusiness(
          reservationId,
          businessId
        )
      : null;

    if (!reservation) {
      throw new NotFoundError(
        "Reservation not found.",
        ErrorCodes.RESERVATION_NOT_FOUND
      );
    }

    return reservation;
  }
}

export default new AssistantService();