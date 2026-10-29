import businessRepository from "../business/business.repository.js";
import reservationEligibilityService from "../reservation-eligibility/reservation-eligibility.service.js";
import reservationRepository from "./reservation.repository.js";
import customerService from "../customer/customer.service.js";
import tableRepository from "../business/table/table.repository.js";
import tableAssignmentService from "../business/table/table-assignment.service.js";
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
// Manage business reservations.
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

    // The backend is responsible for determining
    // how long a reservation lasts.
    const endTime = addMinutes(
      new Date(startTime),
      business.defaultReservationDurationMinutes
    );

    try {
      await reservationEligibilityService.checkEligibility({
        businessId,
        guestCount,
        startTime,
        endTime,
      });

      const tableAssignment =
        await tableAssignmentService.assignTables({
          businessId,
          guestCount,
          startTime,
          endTime,
        });

      if (!tableAssignment) {
        throw new ValidationError(
          "No available table combination found for this reservation.",
          ErrorCodes.RESERVATION_NOT_AVAILABLE
        );
      }

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
          businessId,
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
   * Returns all available reservation slots for a
   * specific local calendar date.
   *
   * The date is interpreted in the business's timezone.
   *
   * Every generated slot is checked using the same
   * eligibility rules as a normal availability request.
   */
  async findAvailableSlots({
    businessId,
    date,
    guestCount,
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

    const openingPeriods =
      await reservationEligibilityService
        .findOpeningPeriodsForDate({
          businessId,
          date,
        });

    const slots = [];

    for (const period of openingPeriods) {
      let currentMinutes =
        period.opensAtMinutes;

      while (
        currentMinutes +
          business.defaultReservationDurationMinutes <=
        period.closesAtMinutes
      ) {
        const startTime =
          this.#createLocalSlotISO({
            date,
            minutes: currentMinutes,
            timezone: business.timezone,
          });

        if (startTime) {
          const endTime =
            addMinutes(
              new Date(startTime),
              business.defaultReservationDurationMinutes
            );

          try {
            await reservationEligibilityService.checkEligibility({
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
            if (!(error instanceof ValidationError)) {
              throw error;
            }
          }
        }

        currentMinutes +=
          business.arrivalIntervalMinutes;
      }
    }

    return slots;
  }

  /**
   * Creates a new reservation.
   *
   * The reservation end time is automatically calculated
   * using the business's default reservation duration.
   *
   * The best available table combination is automatically
   * assigned to the reservation.
   *
   * The authoritative capacity check, table assignment,
   * customer synchronization, and reservation creation
   * are executed inside one SERIALIZABLE transaction.
   */
  async createReservation(reservationData) {
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

    const endTime = addMinutes(
      new Date(reservationData.startTime),
      business.defaultReservationDurationMinutes
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
      businessId:
        completeReservation.businessId,

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
        businessId:
          completeReservation.businessId,

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
          businessId:
            completeReservation.businessId,

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
            businessId:
              completeReservation.businessId,

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
   * using the business's default reservation duration.
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

    const endTime = addMinutes(
      new Date(reservationData.startTime),
      business.defaultReservationDurationMinutes
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
      businessId:
        completeReservation.businessId,

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
        businessId:
          completeReservation.businessId,

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
          businessId:
            completeReservation.businessId,

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
            businessId:
              completeReservation.businessId,

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
      businessId:
        reservation.businessId,

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
   * business and must currently have CONFIRMED status.
   */
  async seatReservation(
    reservationId,
    businessId
  ) {
    const reservation =
      await reservationRepository.findByIdForBusiness(
        reservationId,
        businessId
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
    businessId
  ) {
    const reservation =
      await reservationRepository.findByIdForBusiness(
        reservationId,
        businessId
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
    const business =
      await businessRepository.findById(
        search.businessId
      );

    if (!business) {
      throw new NotFoundError(
        "Business not found.",
        ErrorCodes.BUSINESS_NOT_FOUND
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
   * Finds upcoming reservations for a specific business.
   */
  async findUpcomingForBusiness(
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

    return reservationRepository.findUpcomingForBusiness(
      businessId
    );
  }

  /**
   * Finds all confirmed and seated reservations
   * for a specific business on a specific
   * calendar day.
   */
  async findForBusinessByDay(
    businessId,
    date
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

    return reservationRepository.findForBusinessByDay(
      businessId,
      date,
      business.timezone
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
   * Finds a reservation by ID for a specific business.
   */
  async findByIdForBusiness(id, businessId) {
    const reservation =
      await reservationRepository.findById(id);

    if (!reservation) {
      throw new NotFoundError(
        "Reservation not found.",
        ErrorCodes.RESERVATION_NOT_FOUND
      );
    }

    if (
      reservation.businessId !== businessId
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
   * for a specific business.
   */
  async updateReservationForBusiness(
    id,
    businessId,
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
      existingReservation.businessId !==
      businessId
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
        businessId,
      }
    );
  }

  /**
   * Retrieves reservation counts for each calendar day
   * during a specific month.
   *
   * Aggregates confirmed reservations by local calendar date,
   * respecting the business's timezone to ensure accurate
   * month boundaries. Returns a map of YYYY-MM-DD strings to
   * reservation counts for that day.
   *
   * Useful for availability calendars, analytics dashboards,
   * and booking overview displays.
   */
  async findReservationCountsForMonth(
    businessId,
    year,
    month
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

    const reservations =
      await reservationRepository.findReservationCountsForMonth(
        businessId,
        year,
        month,
        business.timezone
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
              business.timezone,
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

  #createLocalSlotISO({
    date,
    minutes,
    timezone,
  }) {
    const [year, month, day] =
      date.split("-").map(Number);
    const hours = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const targetUtc = Date.UTC(
      year,
      month - 1,
      day,
      hours,
      minute
    );
    const formatter =
      new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });

    let candidateUtc = targetUtc;

    for (let attempt = 0; attempt < 4; attempt++) {
      const parts = formatter.formatToParts(
        new Date(candidateUtc)
      );
      const localParts = Object.fromEntries(
        parts.map(({ type, value }) => [type, value])
      );
      const representedUtc = Date.UTC(
        Number(localParts.year),
        Number(localParts.month) - 1,
        Number(localParts.day),
        Number(localParts.hour),
        Number(localParts.minute)
      );
      const difference = targetUtc - representedUtc;

      if (difference === 0) {
        return new Date(candidateUtc).toISOString();
      }

      candidateUtc += difference;
    }

    return null;
  }
}

export default new ReservationService();