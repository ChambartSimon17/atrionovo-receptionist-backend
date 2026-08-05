import restaurantRepository from "../restaurant.repository.js";
import specialOpeningDayRepository from "./special-opening-day.repository.js";
import NotFoundError from "../../../errors/NotFoundError.js";
import ValidationError from "../../../errors/ValidationError.js";
import { minutesToTime } from "../../../utils/time.utils.js";

// ======================================================
// Special Opening Day Service
// ======================================================
//
// Responsibility
// Manage a restaurant's special opening days.
//
// Business Rules
// - Restaurant must exist
// - One special opening day per date
// - Closed days cannot contain opening periods
// - Open days require at least one opening period
// - Opening time must be before closing time
// - Opening periods may not overlap
// ======================================================

class SpecialOpeningDayService {
  /**
   * Creates a new special opening day.
   */
  async create(restaurantId, specialOpeningDay) {
    await this.#ensureRestaurantExists(restaurantId);

    const date = new Date(specialOpeningDay.date);

    await this.#ensureDateIsAvailable(
      restaurantId,
      date
    );

    this.#validateSpecialOpeningDay(
      specialOpeningDay
    );

    return specialOpeningDayRepository.createSpecialOpeningDay({
      restaurantId,
      ...specialOpeningDay,
      date,
    });
  }

  /**
   * Retrieves all special opening days
   * for a restaurant.
   */
  async findByRestaurant(restaurantId) {
    await this.#ensureRestaurantExists(restaurantId);

    return specialOpeningDayRepository.findByRestaurant(
      restaurantId
    );
  }

  /**
   * Updates an existing special opening day.
   */
  async update(id, specialOpeningDay) {
    const existing =
      await specialOpeningDayRepository.findById(id);

    if (!existing) {
      throw new NotFoundError(
        "Special opening day not found.",
        ErrorCodes.SPECIAL_OPENING_DAY_NOT_FOUND
      );
    }

    const date = new Date(specialOpeningDay.date);

    const duplicate =
      await specialOpeningDayRepository.findByRestaurantAndDate(
        existing.restaurantId,
        date
      );

    if (duplicate && duplicate.id !== id) {
      throw new ValidationError(
        "A special opening day already exists for this date."
      );
    }

    this.#validateSpecialOpeningDay(
      specialOpeningDay
    );

    return specialOpeningDayRepository.updateSpecialOpeningDay(
      id,
      {
        ...specialOpeningDay,
        date,
      }
    );
  }

  /**
   * Deletes a special opening day.
   */
  async delete(id) {
    const existing =
      await specialOpeningDayRepository.findById(id);

    if (!existing) {
      throw new NotFoundError(
        "Special opening day not found.",
        ErrorCodes.SPECIAL_OPENING_DAY_NOT_FOUND
      );
    }

    await specialOpeningDayRepository.deleteSpecialOpeningDay(
      id
    );
  }

  async #ensureRestaurantExists(restaurantId) {
    const restaurant =
      await restaurantRepository.findById(restaurantId);

    if (!restaurant) {
      throw new NotFoundError(
        "Restaurant not found.",
        ErrorCodes.RESTAURANT_NOT_FOUND
      );
    }
  }

  async #ensureDateIsAvailable(
    restaurantId,
    date
  ) {
    const existing =
      await specialOpeningDayRepository.findByRestaurantAndDate(
        restaurantId,
        date
      );

    if (existing) {
      throw new ValidationError(
        "A special opening day already exists for this date."
      );
    }
  }

  #validateSpecialOpeningDay(
    specialOpeningDay
  ) {
    if (specialOpeningDay.isClosed) {
      if (
        specialOpeningDay.openingPeriods.length > 0
      ) {
        throw new ValidationError(
          "Closed days cannot contain opening periods."
        );
      }

      return;
    }

    if (
      specialOpeningDay.openingPeriods.length === 0
    ) {
      throw new ValidationError(
        "Open days must contain at least one opening period."
      );
    }

    this.#validateOpeningPeriods(
      specialOpeningDay.openingPeriods
    );

    this.#validateNoOverlappingPeriods(
      specialOpeningDay.openingPeriods
    );
  }

  #validateOpeningPeriods(openingPeriods) {
    for (const openingPeriod of openingPeriods) {
      if (
        openingPeriod.opensAtMinutes >=
        openingPeriod.closesAtMinutes
      ) {
        throw new ValidationError(
          "Opening time must be before closing time."
        );
      }
    }
  }

  #validateNoOverlappingPeriods(
    openingPeriods
  ) {
    const sortedPeriods = [...openingPeriods].sort(
      (a, b) =>
        a.opensAtMinutes - b.opensAtMinutes
    );

    for (let i = 1; i < sortedPeriods.length; i++) {
      const previous = sortedPeriods[i - 1];
      const current = sortedPeriods[i];

      if (
        current.opensAtMinutes <
        previous.closesAtMinutes
      ) {
        const previousPeriod =
          `${minutesToTime(previous.opensAtMinutes)}-${minutesToTime(previous.closesAtMinutes)}`;

        const currentPeriod =
          `${minutesToTime(current.opensAtMinutes)}-${minutesToTime(current.closesAtMinutes)}`;

        throw new ValidationError(
          `Opening periods overlap: ${previousPeriod} and ${currentPeriod}.`
        );
      }
    }
  }
}

export default new SpecialOpeningDayService();