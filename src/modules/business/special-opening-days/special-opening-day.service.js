import businessRepository from "../business.repository.js";
import specialOpeningDayRepository from "./special-opening-day.repository.js";
import NotFoundError from "../../../errors/NotFoundError.js";
import ValidationError from "../../../errors/ValidationError.js";
import { ErrorCodes } from "../../../errors/error-codes.js";
import { minutesToTime } from "../../../utils/time.utils.js";

// ======================================================
// Special Opening Day Service
// ======================================================
//
// Responsibility
// Manage a business's special opening days.
//
// Business Rules
// - Business must exist
// - One special opening day per date
// - Closed days cannot contain opening periods
// - Open days require at least one opening period
// - Opening time must be before closing time
// - Opening periods may not overlap
// - A special opening day may only be accessed by
//   its own business
// ======================================================

class SpecialOpeningDayService {
  /**
   * Creates a new special opening day.
   */
  async create(
    businessId,
    specialOpeningDay
  ) {
    await this.#ensureBusinessExists(
      businessId
    );

    const date = new Date(
      specialOpeningDay.date
    );

    await this.#ensureDateIsAvailable(
      businessId,
      date
    );

    this.#validateSpecialOpeningDay(
      specialOpeningDay
    );

    return specialOpeningDayRepository.createSpecialOpeningDay(
      {
        businessId,
        ...specialOpeningDay,
        date,
      }
    );
  }

  /**
   * Retrieves all special opening days
   * for a business.
   */
  async findByBusiness(
    businessId
  ) {
    await this.#ensureBusinessExists(
      businessId
    );

    return specialOpeningDayRepository.findByBusiness(
      businessId
    );
  }

  /**
   * Updates an existing special opening day.
   *
   * The businessId is used to ensure that the
   * special opening day belongs to the authenticated
   * business.
   */
  async update(
    id,
    businessId,
    specialOpeningDay
  ) {
    const existing =
      await specialOpeningDayRepository.findById(
        id
      );

    if (!existing) {
      throw new NotFoundError(
        "Special opening day not found.",
        ErrorCodes.SPECIAL_OPENING_DAY_NOT_FOUND
      );
    }

    this.#ensureBelongsToBusiness(
      existing,
      businessId
    );

    const date = new Date(
      specialOpeningDay.date
    );

    const duplicate =
      await specialOpeningDayRepository.findByBusinessAndDate(
        businessId,
        date
      );

    if (
      duplicate &&
      duplicate.id !== id
    ) {
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
   *
   * The businessId is used to ensure that the
   * special opening day belongs to the authenticated
   * business.
   */
  async delete(
    id,
    businessId
  ) {
    const existing =
      await specialOpeningDayRepository.findById(
        id
      );

    if (!existing) {
      throw new NotFoundError(
        "Special opening day not found.",
        ErrorCodes.SPECIAL_OPENING_DAY_NOT_FOUND
      );
    }

    this.#ensureBelongsToBusiness(
      existing,
      businessId
    );

    await specialOpeningDayRepository.deleteSpecialOpeningDay(
      id
    );
  }

  /**
   * Ensures the business exists.
   */
  async #ensureBusinessExists(
    businessId
  ) {
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
  }

  /**
   * Ensures that a special opening day belongs
   * to the requested business.
   */
  #ensureBelongsToBusiness(
    specialOpeningDay,
    businessId
  ) {
    if (
      specialOpeningDay.businessId !==
      businessId
    ) {
      throw new NotFoundError(
        "Special opening day not found.",
        ErrorCodes.SPECIAL_OPENING_DAY_NOT_FOUND
      );
    }
  }

  /**
   * Ensures no special opening day already exists
   * for the requested date.
   */
  async #ensureDateIsAvailable(
    businessId,
    date
  ) {
    const existing =
      await specialOpeningDayRepository.findByBusinessAndDate(
        businessId,
        date
      );

    if (existing) {
      throw new ValidationError(
        "A special opening day already exists for this date."
      );
    }
  }

  /**
   * Validates the complete special opening day.
   */
  #validateSpecialOpeningDay(
    specialOpeningDay
  ) {
    if (specialOpeningDay.isClosed) {
      if (
        specialOpeningDay.openingPeriods
          .length > 0
      ) {
        throw new ValidationError(
          "Closed days cannot contain opening periods."
        );
      }

      return;
    }

    if (
      specialOpeningDay.openingPeriods
        .length === 0
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

  /**
   * Validates every opening period.
   */
  #validateOpeningPeriods(
    openingPeriods
  ) {
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

  /**
   * Ensures opening periods do not overlap.
   */
  #validateNoOverlappingPeriods(
    openingPeriods
  ) {
    const sortedPeriods =
      [...openingPeriods].sort(
        (a, b) =>
          a.opensAtMinutes -
          b.opensAtMinutes
      );

    for (
      let i = 1;
      i < sortedPeriods.length;
      i++
    ) {
      const previous =
        sortedPeriods[i - 1];

      const current =
        sortedPeriods[i];

      if (
        current.opensAtMinutes <
        previous.closesAtMinutes
      ) {
        const previousPeriod =
          `${minutesToTime(
            previous.opensAtMinutes
          )}-${minutesToTime(
            previous.closesAtMinutes
          )}`;

        const currentPeriod =
          `${minutesToTime(
            current.opensAtMinutes
          )}-${minutesToTime(
            current.closesAtMinutes
          )}`;

        throw new ValidationError(
          `Opening periods overlap: ${previousPeriod} and ${currentPeriod}.`
        );
      }
    }
  }
}

export default new SpecialOpeningDayService();