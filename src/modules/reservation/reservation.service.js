import restaurantRepository from "../restaurant/restaurant.repository.js";
import reservationEligibilityService from "../reservation-eligibility/reservation-eligibility.service.js";
import reservationRepository from "./reservation.repository.js";
import customerService from "../customer/customer.service.js";
import tableRepository from "../restaurant/table/table.repository.js";
import tableAssignmentService from "../restaurant/table/table-assignment.service.js";
import NotFoundError from "../../errors/NotFoundError.js";
import ValidationError from "../../errors/ValidationError.js";
import { ErrorCodes } from "../../errors/error-codes.js";
import { runTransaction } from "../../utils/transaction.utils.js";
import { addMinutes } from "../../utils/time.utils.js";
import { normalizePhoneNumber } from "../../utils/phone.utils.js";
import { normalizeEmail } from "../../utils/email.utils.js";

// ======================================================
// Reservation Service
// ======================================================
//
// Responsibility
// Manage restaurant reservations.
//
// This service orchestrates reservation-related business
// operations and delegates eligibility checks to the
// Reservation Eligibility Service.
//
// Concurrency
// Reservation creation and updates use a SERIALIZABLE
// transaction for the authoritative capacity check,
// table assignment, customer synchronization, and
// reservation write.
//
// The initial eligibility check remains outside the
// transaction as a fast pre-validation. The capacity
// check is repeated inside the transaction because the
// database state may have changed between the initial
// check and the transaction.
// ======================================================

class ReservationService {
  /**
   * Checks whether a reservation can be accepted.
   *
   * If the requested slot is unavailable, nearby
   * alternative slots are returned.
   */
  async checkAvailability({
    restaurantId,
    guestCount,
    startTime,
    endTime,
  }) {
    try {
      await reservationEligibilityService.checkEligibility({
        restaurantId,
        guestCount,
        startTime,
        endTime,
      });

      return {
        available: true,

        requestedSlot: {
          startTime,
          endTime,
        },

        alternativeSlots: [],

        reason: null,
      };
    } catch (error) {
      if (!(error instanceof ValidationError)) {
        throw error;
      }

      const alternativeSlots =
        await reservationEligibilityService.findAlternativeSlots({
          restaurantId,
          guestCount,
          startTime,
          endTime,
        });

      return {
        available: false,

        requestedSlot: {
          startTime,
          endTime,
        },

        alternativeSlots,

        reason: error.code,
      };
    }
  }

  /**
   * Creates a new reservation.
   *
   * The reservation end time is automatically calculated
   * using the restaurant's default reservation duration.
   *
   * The best available table combination is automatically
   * assigned to the reservation.
   *
   * The authoritative capacity check, table assignment,
   * customer synchronization, and reservation creation
   * are executed inside one SERIALIZABLE transaction.
   */
  async createReservation(reservationData) {
    const restaurant =
      await restaurantRepository.findById(
        reservationData.restaurantId
      );

    if (!restaurant) {
      throw new NotFoundError(
        "Restaurant not found.",
        ErrorCodes.RESTAURANT_NOT_FOUND
      );
    }

    const endTime = addMinutes(
      new Date(reservationData.startTime),
      restaurant.defaultReservationDurationMinutes
    );

    const completeReservation = {
      ...reservationData,

      phoneNumber: normalizePhoneNumber(
        reservationData.phoneNumber
      ),

      email: normalizeEmail(
        reservationData.email
      ),

      endTime,
    };

    // Fast pre-validation.
    //
    // The capacity check performed here is not authoritative
    // because another reservation could be created immediately
    // afterwards. Capacity is therefore checked again inside
    // the transaction below.
    await reservationEligibilityService.checkEligibility({
      restaurantId:
        completeReservation.restaurantId,

      guestCount:
        completeReservation.guestCount,

      startTime:
        completeReservation.startTime,

      endTime:
        completeReservation.endTime,
    });

    return runTransaction(async (tx) => {
      // Authoritative capacity check.
      //
      // This uses the transaction client so the capacity
      // decision is made as part of the same transaction
      // that creates the reservation.
      await reservationEligibilityService.checkCapacity({
        restaurantId:
          completeReservation.restaurantId,

        guestCount:
          completeReservation.guestCount,

        startTime:
          completeReservation.startTime,

        endTime:
          completeReservation.endTime,

        db: tx,
      });

      const tableAssignment =
        await tableAssignmentService.assignTables({
          restaurantId:
            completeReservation.restaurantId,

          guestCount:
            completeReservation.guestCount,

          startTime:
            completeReservation.startTime,

          endTime:
            completeReservation.endTime,

          db: tx,
        });

      if (!tableAssignment) {
        throw new ValidationError(
          "No available table combination found for this reservation.",
          ErrorCodes.RESERVATION_NOT_AVAILABLE
        );
      }

      const customer =
        await customerService.syncCustomer(
          {
            restaurantId:
              completeReservation.restaurantId,

            firstName:
              completeReservation.firstName,

            lastName:
              completeReservation.lastName,

            phoneNumber:
              completeReservation.phoneNumber,

            email:
              completeReservation.email,
          },
          tx
        );

      const reservation =
        await reservationRepository.createWithTables(
          {
            ...completeReservation,
            customerId: customer.id,
          },
          tableAssignment.tables.map(
            (table) => table.id
          ),
          tx
        );

      return reservation;
    });
  }

  /**
   * Updates an existing reservation.
   *
   * The reservation end time is automatically recalculated
   * using the restaurant's default reservation duration.
   *
   * The table assignment is recalculated based on the
   * updated reservation details.
   *
   * The authoritative capacity check, table assignment,
   * customer synchronization, and reservation update
   * are executed inside one SERIALIZABLE transaction.
   */
  async updateReservation(id, reservationData) {
    const existingReservation =
      await reservationRepository.findById(id);

    if (!existingReservation) {
      throw new NotFoundError(
        "Reservation not found.",
        ErrorCodes.RESERVATION_NOT_FOUND
      );
    }

    if (existingReservation.status !== "CONFIRMED") {
      throw new ValidationError(
        `Reservation cannot be updated because it is ${existingReservation.status.toLowerCase()}.`,
        ErrorCodes.RESERVATION_NOT_CONFIRMED
      );
    }

    const restaurant =
      await restaurantRepository.findById(
        reservationData.restaurantId
      );

    if (!restaurant) {
      throw new NotFoundError(
        "Restaurant not found.",
        ErrorCodes.RESTAURANT_NOT_FOUND
      );
    }

    const endTime = addMinutes(
      new Date(reservationData.startTime),
      restaurant.defaultReservationDurationMinutes
    );

    const completeReservation = {
      ...reservationData,

      phoneNumber: normalizePhoneNumber(
        reservationData.phoneNumber
      ),

      email: normalizeEmail(
        reservationData.email
      ),

      endTime,
    };

    // Fast pre-validation.
    //
    // The capacity check performed here is not authoritative
    // because another reservation could be created immediately
    // afterwards. Capacity is therefore checked again inside
    // the transaction below.
    await reservationEligibilityService.checkEligibility({
      restaurantId:
        completeReservation.restaurantId,

      guestCount:
        completeReservation.guestCount,

      startTime:
        completeReservation.startTime,

      endTime:
        completeReservation.endTime,

      ignoreReservationId: id,
    });

    return runTransaction(async (tx) => {
      // Authoritative capacity check.
      //
      // The current reservation is excluded from the
      // calculation because it is being updated.
      await reservationEligibilityService.checkCapacity({
        restaurantId:
          completeReservation.restaurantId,

        guestCount:
          completeReservation.guestCount,

        startTime:
          completeReservation.startTime,

        endTime:
          completeReservation.endTime,

        ignoreReservationId: id,

        db: tx,
      });

      const tableAssignment =
        await tableAssignmentService.assignTables({
          restaurantId:
            completeReservation.restaurantId,

          guestCount:
            completeReservation.guestCount,

          startTime:
            completeReservation.startTime,

          endTime:
            completeReservation.endTime,

          ignoreReservationId: id,

          db: tx,
        });

      if (!tableAssignment) {
        throw new ValidationError(
          "No available table combination found for this reservation.",
          ErrorCodes.RESERVATION_NOT_AVAILABLE
        );
      }

      const customer =
        await customerService.syncCustomer(
          {
            restaurantId:
              completeReservation.restaurantId,

            firstName:
              completeReservation.firstName,

            lastName:
              completeReservation.lastName,

            phoneNumber:
              completeReservation.phoneNumber,

            email:
              completeReservation.email,
          },
          tx
        );

      return reservationRepository.update(
        id,
        {
          ...completeReservation,

          customerId:
            customer.id,

          tables: {
            deleteMany: {},

            create:
              tableAssignment.tables.map(
                (table) => ({
                  tableId: table.id,
                })
              ),
          },
        },
        tx
      );
    });
  }

  /**
   * Reschedules an existing reservation.
   */
  async rescheduleReservation(
    id,
    { startTime }
  ) {
    const reservation =
      await reservationRepository.findById(id);

    if (!reservation) {
      throw new NotFoundError(
        "Reservation not found.",
        ErrorCodes.RESERVATION_NOT_FOUND
      );
    }

    if (
      reservation.status !==
      "CONFIRMED"
    ) {
      throw new ValidationError(
        `Reservation cannot be rescheduled because it is ${reservation.status.toLowerCase()}.`,
        ErrorCodes.RESERVATION_NOT_CONFIRMED
      );
    }

    return this.updateReservation(id, {
      restaurantId:
        reservation.restaurantId,

      firstName:
        reservation.firstName,

      lastName:
        reservation.lastName,

      phoneNumber:
        reservation.phoneNumber,

      email:
        reservation.email,

      guestCount:
        reservation.guestCount,

      startTime,

      notes:
        reservation.notes,
    });
  }

  /**
   * Deletes an existing reservation.
   *
   * Related table assignments are automatically removed
   * through the ReservationTable foreign-key cascade.
   */
  async deleteReservation(id) {
    const reservation =
      await reservationRepository.findById(id);

    if (!reservation) {
      throw new NotFoundError(
        "Reservation not found.",
        ErrorCodes.RESERVATION_NOT_FOUND
      );
    }

    await reservationRepository.delete(id);
  }

  /**
   * Cancels an existing reservation.
   *
   * The reservation remains in the database for historical
   * purposes, but its table assignments are removed so the
   * tables become available for future reservations.
   *
   * The table assignments and status update are executed
   * inside the same transaction to prevent partial changes.
   */
  async cancelReservation(id) {
    const reservation =
      await reservationRepository.findById(id);

    if (!reservation) {
      throw new NotFoundError(
        "Reservation not found.",
        ErrorCodes.RESERVATION_NOT_FOUND
      );
    }

    if (
      reservation.status !==
      "CONFIRMED"
    ) {
      throw new ValidationError(
        `Reservation cannot be cancelled because it is ${reservation.status.toLowerCase()}.`,
        ErrorCodes.RESERVATION_NOT_CONFIRMED
      );
    }

    return runTransaction(async (tx) => {
      await tableRepository.deleteReservationTables(
        id,
        tx
      );

      return reservationRepository.update(
        id,
        {
          status: "CANCELLED",
        },
        tx
      );
    });
  }

  /**
   * Marks a confirmed reservation as seated.
   *
   * The reservation must belong to the specified
   * restaurant and must currently have CONFIRMED status.
   */
  async seatReservation(
    reservationId,
    restaurantId
  ) {
    const reservation =
      await reservationRepository.findByIdForRestaurant(
        reservationId,
        restaurantId
      );

    if (!reservation) {
      throw new NotFoundError(
        "Reservation not found.",
        ErrorCodes.RESERVATION_NOT_FOUND
      );
    }

    if (
      reservation.status !==
      "CONFIRMED"
    ) {
      throw new ValidationError(
        "Only confirmed reservations can be marked as seated.",
        ErrorCodes.RESERVATION_NOT_CONFIRMED
      );
    }

    return reservationRepository.markAsSeated(
      reservationId
    );
  }

  /**
   * Marks a seated reservation as completed.
   *
   * A reservation can only be completed after
   * the guests have been marked as seated.
   *
   * The reservation remains in the database for
   * historical purposes.
   */
  async completeReservation(
    reservationId,
    restaurantId
  ) {
    const reservation =
      await reservationRepository.findByIdForRestaurant(
        reservationId,
        restaurantId
      );

    if (!reservation) {
      throw new NotFoundError(
        "Reservation not found.",
        ErrorCodes.RESERVATION_NOT_FOUND
      );
    }

    if (
      reservation.status !==
      "SEATED"
    ) {
      throw new ValidationError(
        "Only seated reservations can be marked as completed.",
        ErrorCodes.RESERVATION_NOT_CONFIRMED
      );
    }

    return reservationRepository.markAsCompleted(
      reservationId
    );
  }

  /**
   * Finds upcoming reservations.
   */
  async findUpcoming(search) {
    const restaurant =
      await restaurantRepository.findById(
        search.restaurantId
      );

    if (!restaurant) {
      throw new NotFoundError(
        "Restaurant not found.",
        ErrorCodes.RESTAURANT_NOT_FOUND
      );
    }

    if (
      !search.phoneNumber &&
      !search.email &&
      !search.lastName
    ) {
      throw new ValidationError(
        "Provide at least one search parameter.",
        ErrorCodes.MISSING_SEARCH_PARAMETER
      );
    }

    const searchCriteria = {
      ...search,
    };

    if (search.phoneNumber) {
      searchCriteria.phoneNumber =
        normalizePhoneNumber(
          search.phoneNumber
        );
    }

    if (search.email) {
      searchCriteria.email =
        normalizeEmail(
          search.email
        );
    }

    return reservationRepository.findUpcoming(
      searchCriteria
    );
  }

  /**
   * Finds upcoming reservations for a specific restaurant.
   */
  async findUpcomingForRestaurant(
    restaurantId
  ) {
    const restaurant =
      await restaurantRepository.findById(
        restaurantId
      );

    if (!restaurant) {
      throw new NotFoundError(
        "Restaurant not found.",
        ErrorCodes.RESTAURANT_NOT_FOUND
      );
    }

    return reservationRepository.findUpcomingForRestaurant(
      restaurantId
    );
  }

  /**
   * Finds all confirmed and seated reservations
   * for a specific restaurant on a specific
   * calendar day.
   */
  async findForRestaurantByDay(
    restaurantId,
    date
  ) {
    const restaurant =
      await restaurantRepository.findById(
        restaurantId
      );

    if (!restaurant) {
      throw new NotFoundError(
        "Restaurant not found.",
        ErrorCodes.RESTAURANT_NOT_FOUND
      );
    }

    return reservationRepository.findForRestaurantByDay(
      restaurantId,
      date,
      restaurant.timezone
    );
  }

  /**
   * Finds a reservation by ID.
   */
  async findById(id) {
    const reservation =
      await reservationRepository.findById(id);

    if (!reservation) {
      throw new NotFoundError(
        "Reservation not found.",
        ErrorCodes.RESERVATION_NOT_FOUND
      );
    }

    return reservation;
  }

  /**
   * Finds a reservation by ID for a specific restaurant.
   */
  async findByIdForRestaurant(id, restaurantId) {
    const reservation =
      await reservationRepository.findById(id);

    if (!reservation) {
      throw new NotFoundError(
        "Reservation not found.",
        ErrorCodes.RESERVATION_NOT_FOUND
      );
    }

    if (
      reservation.restaurantId !== restaurantId
    ) {
      throw new NotFoundError(
        "Reservation not found.",
        ErrorCodes.RESERVATION_NOT_FOUND
      );
    }

    return reservation;
  }

  /**
   * Updates an existing reservation
   * for a specific restaurant.
   */
  async updateReservationForRestaurant(
    id,
    restaurantId,
    reservationData
  ) {
    const existingReservation =
      await reservationRepository.findById(id);

    if (!existingReservation) {
      throw new NotFoundError(
        "Reservation not found.",
        ErrorCodes.RESERVATION_NOT_FOUND
      );
    }

    if (
      existingReservation.restaurantId !==
      restaurantId
    ) {
      throw new NotFoundError(
        "Reservation not found.",
        ErrorCodes.RESERVATION_NOT_FOUND
      );
    }

    return this.updateReservation(
      id,
      {
        ...reservationData,
        restaurantId,
      }
    );
  }

  /**
   * Retrieves reservation counts for each calendar day
   * during a specific month.
   *
   * Aggregates confirmed reservations by local calendar date,
   * respecting the restaurant's timezone to ensure accurate
   * month boundaries. Returns a map of YYYY-MM-DD strings to
   * reservation counts for that day.
   *
   * Useful for availability calendars, analytics dashboards,
   * and booking overview displays.
   */
  async findReservationCountsForMonth(
    restaurantId,
    year,
    month
  ) {
    const restaurant =
      await restaurantRepository.findById(
        restaurantId
      );

    if (!restaurant) {
      throw new NotFoundError(
        "Restaurant not found.",
        ErrorCodes.RESTAURANT_NOT_FOUND
      );
    }

    const reservations =
      await reservationRepository.findReservationCountsForMonth(
        restaurantId,
        year,
        month,
        restaurant.timezone
      );

    const counts = {};

    for (const reservation of reservations) {
      const date =
        new Date(
          reservation.startTime
        );

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

      const parts =
        formatter.formatToParts(date);

      const yearPart =
        parts.find(
          (part) =>
            part.type === "year"
        ).value;

      const monthPart =
        parts.find(
          (part) =>
            part.type === "month"
        ).value;

      const dayPart =
        parts.find(
          (part) =>
            part.type === "day"
        ).value;

      const localDate =
        `${yearPart}-${monthPart}-${dayPart}`;

      counts[localDate] =
        (counts[localDate] || 0) + 1;
    }

    return counts;
  }
}

export default new ReservationService();