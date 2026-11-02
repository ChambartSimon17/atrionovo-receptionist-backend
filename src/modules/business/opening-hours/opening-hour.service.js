import businessRepository from "../business.repository.js";
import openingHourRepository from "./opening-hour.repository.js";
import NotFoundError from "../../../errors/NotFoundError.js";
import ValidationError from "../../../errors/ValidationError.js";
import { ErrorCodes } from "../../../errors/error-codes.js";
import { minutesToTime } from "../../../utils/time.utils.js";

// ======================================================
// Opening Hour Service
// ======================================================
//
// Responsibility
// Manage a business's weekly opening schedule.
//
// Business Rules
// - Business must exist
// - Opening time must be before closing time
// - Opening periods may not overlap
//
// This service orchestrates the business logic and delegates
// database operations to the repositories.
// ======================================================

class OpeningHourService {
  /**
   * Replaces the business's complete weekly opening schedule.
   */
  async replaceSchedule(businessId, openingHours) {
    await this.#ensureBusinessExists(businessId);

    this.#validateOpeningHours(openingHours);

    await openingHourRepository.replaceSchedule(
      businessId,
      openingHours
    );

    return await openingHourRepository.findSchedule(businessId);
  }

  /**
   * Retrieves the business's complete weekly opening schedule.
   */
  async findSchedule(businessId) {
    await this.#ensureBusinessExists(businessId);

    return openingHourRepository.findSchedule(businessId);
  }

  /**
   * Ensures the business exists before performing
   * any opening hour operations.
   */
  async #ensureBusinessExists(businessId) {
    const business = await businessRepository.findById(businessId);

    if (!business) {
      throw new NotFoundError(
        "Business not found.",
        ErrorCodes.BUSINESS_NOT_FOUND
      );
    }
  }

  /**
   * Validates the business's complete weekly schedule.
   */
  #validateOpeningHours(openingHours) {
    this.#validateOpeningPeriods(openingHours);
    this.#validateNoOverlappingPeriods(openingHours);
  }

  /**
   * Validates every individual opening period.
   */
  #validateOpeningPeriods(openingHours) {
    for (const openingHour of openingHours) {
      if (openingHour.opensAtMinutes >= openingHour.closesAtMinutes) {
        throw new ValidationError(
          "Opening time must be before closing time."
        );
      }
    }
  }

  /**
   * Ensures opening periods do not overlap.
   */
  #validateNoOverlappingPeriods(openingHours) {
    const groupedOpeningHours =
      this.#groupOpeningHoursByDay(openingHours);

    for (const dayOpeningHours of groupedOpeningHours.values()) {
      this.#validateDaySchedule(dayOpeningHours);
    }
  }

  /**
   * Groups opening periods by weekday.
   *
   * This allows overlap validation to be performed
   * independently for each day.
   */
  #groupOpeningHoursByDay(openingHours) {
    const groupedOpeningHours = new Map();

    for (const openingHour of openingHours) {
      if (!groupedOpeningHours.has(openingHour.dayOfWeek)) {
        groupedOpeningHours.set(openingHour.dayOfWeek, []);
      }

      groupedOpeningHours.get(openingHour.dayOfWeek).push(openingHour);
    }

    return groupedOpeningHours;
  }

  /**
   * Validates that a day's opening periods do not overlap.
   *
   * Opening periods are sorted by opening time so each
   * period only needs to be compared with the previous one.
   */
  #validateDaySchedule(dayOpeningHours) {
    const sortedOpeningHours = [...dayOpeningHours].sort(
      (a, b) => a.opensAtMinutes - b.opensAtMinutes
    );

    for (let i = 1; i < sortedOpeningHours.length; i++) {
      const previous = sortedOpeningHours[i - 1];
      const current = sortedOpeningHours[i];

      if (current.opensAtMinutes < previous.closesAtMinutes) {
        const previousPeriod =
          `${minutesToTime(previous.opensAtMinutes)}-${minutesToTime(previous.closesAtMinutes)}`;

        const currentPeriod =
          `${minutesToTime(current.opensAtMinutes)}-${minutesToTime(current.closesAtMinutes)}`;

        throw new ValidationError(
          `Opening periods overlap on ${current.dayOfWeek}: ${previousPeriod} and ${currentPeriod}.`
        );
      }
    }
  }
}

export default new OpeningHourService();