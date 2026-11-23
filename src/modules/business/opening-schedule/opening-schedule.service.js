import openingHourRepository from "../opening-hours/opening-hour.repository.js";
import specialOpeningDayRepository from "../special-opening-days/special-opening-day.repository.js";
import { dateToDayOfWeek } from "../../../utils/time.utils.js";

// ======================================================
// Opening Schedule Service
// ======================================================
//
// Responsibility
// Determine which opening schedule applies
// for a specific business on a specific date.
//
// Priority
// 1. Special opening day
// 2. Weekly opening hours
// ======================================================

class OpeningScheduleService {
  /**
   * Retrieves the opening periods that apply
   * to the given reservation date.
   */
  async findOpeningPeriods(
    business,
    reservationDate
  ) {
    const schedule = await this.findDaySchedule(
      business,
      reservationDate
    );

    return schedule.periods;
  }

  /**
   * The opening periods of the day and whether they come
   * from a special opening day. Locations with their own
   * hours ignore the weekly hours of the business, but not
   * a special day (a holiday, a closure).
   *
   * Returns { isSpecialDay, periods }.
   */
  async findDaySchedule(business, reservationDate) {
    const specialOpeningDay =
      await specialOpeningDayRepository.findByBusinessAndDate(
        business.id,
        this.#toCalendarDate(reservationDate)
      );

    if (specialOpeningDay) {
      return {
        isSpecialDay: true,
        periods: specialOpeningDay.isClosed
          ? []
          : specialOpeningDay.openingPeriods,
      };
    }

    const dayOfWeek = dateToDayOfWeek(
      reservationDate,
      business.timezone
    );

    return {
      isSpecialDay: false,
      periods: await openingHourRepository.findByBusinessAndDay(
        business.id,
        dayOfWeek
      ),
    };
  }

  /**
   * Converts a Date into a calendar date
   * with the time set to midnight.
   */
  #toCalendarDate(date) {
    return new Date(
        Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate()
      )
    );
  }
}

export default new OpeningScheduleService();