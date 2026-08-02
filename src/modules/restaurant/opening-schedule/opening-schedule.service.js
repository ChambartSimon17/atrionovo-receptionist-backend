import openingHourRepository from "../opening-hours/opening-hour.repository.js";
import specialOpeningDayRepository from "../special-opening-days/special-opening-day.repository.js";
import { dateToDayOfWeek } from "../../../utils/time.utils.js";

// ======================================================
// Opening Schedule Service
// ======================================================
//
// Responsibility
// Determine which opening schedule applies
// for a specific restaurant on a specific date.
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
    restaurant,
    reservationDate
  ) {
    const specialOpeningDay =
      await specialOpeningDayRepository.findByRestaurantAndDate(
        restaurant.id,
        this.#toCalendarDate(reservationDate)
      );

    if (specialOpeningDay) {
      if (specialOpeningDay.isClosed) {
        return [];
      }

      return specialOpeningDay.openingPeriods;
    }

    const dayOfWeek = dateToDayOfWeek(
      reservationDate,
      restaurant.timezone
    );

    return openingHourRepository.findByRestaurantAndDay(
      restaurant.id,
      dayOfWeek
    );
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