import massageAppointmentRepository from "./massage-appointment.repository.js";
import massageAvailabilityService from "./massage-availability.service.js";
import { DateTime } from "luxon";
import businessRepository from "../business/business.repository.js";
import customerService from "../customer/customer.service.js";
import { localDateOf } from "./local-time.js";
import ConflictError from "../../errors/ConflictError.js";
import NotFoundError from "../../errors/NotFoundError.js";
import ValidationError from "../../errors/ValidationError.js";
import { ErrorCodes } from "../../errors/error-codes.js";
import { getUtcRangeForLocalDay } from "../../utils/time.utils.js";
import { runTransaction } from "../../utils/transaction.utils.js";

// ======================================================
// Massage Appointment Service
// ======================================================
//
// Responsibility
// Create, list and update the appointments of a MASSAGE
// business.
//
// Creating an appointment
// - runs in a SERIALIZABLE transaction, so two bookings at
//   the same moment cannot take the same therapist or room
// - re-checks availability inside that transaction
// - assigns a therapist and a room (customers cannot
//   choose them)
// - copies customer, massage name, duration and price onto
//   the appointment, so later changes do not alter history
//
// Status changes
// A CONFIRMED appointment can become COMPLETED, CANCELLED
// or NO_SHOW. Other statuses are final.
// ======================================================

/**
 * Shape sent to the clients.
 */
function toDto(appointment) {
  return {
    id: appointment.id,
    status: appointment.status,
    startTime: appointment.startTime.toISOString(),
    endTime: appointment.endTime.toISOString(),
    serviceId: appointment.massageServiceId,
    serviceName: appointment.serviceName,
    durationMinutes: appointment.durationMinutes,
    priceCents: appointment.priceCents,
    firstName: appointment.firstName,
    lastName: appointment.lastName,
    phoneNumber: appointment.phoneNumber,
    email: appointment.email,
    notes: appointment.notes,
    therapistName: appointment.therapist.name,
    roomName: appointment.room.name,
    therapistId: appointment.therapistId,
    roomId: appointment.roomId,
    payment: appointment.payments?.[0]
      ? {
          id: appointment.payments[0].id,
          method: appointment.payments[0].method,
          totalCents:
            appointment.payments[0].amountCents +
            appointment.payments[0].tipCents,
          tipCents: appointment.payments[0].tipCents,
          paidAt: appointment.payments[0].paidAt?.toISOString() ?? null,
        }
      : null,
  };
}

class MassageAppointmentService {
  /**
   * All appointments of one local day, in time order.
   */
  async listForDay(businessId, date) {
    const business = await this.#getBusiness(businessId);

    const range = getUtcRangeForLocalDay(
      date,
      business.timezone
    );

    const appointments =
      await massageAppointmentRepository.findAllInRange(
        businessId,
        range.start,
        range.end
      );

    return appointments.map(toDto);
  }

  /**
   * Number of appointments per local calendar day of a
   * month, like { "2026-11-02": 3, "2026-11-05": 1 }.
   * Days without appointments are left out.
   */
  async countsForMonth(businessId, year, month) {
    const business = await this.#getBusiness(businessId);

    const first = DateTime.fromObject(
      { year, month, day: 1 },
      { zone: business.timezone }
    ).startOf("day");

    const appointments =
      await massageAppointmentRepository.findStartTimesInRange(
        businessId,
        first.toJSDate(),
        first.plus({ months: 1 }).toJSDate()
      );

    const counts = {};

    for (const appointment of appointments) {
      const date = localDateOf(
        appointment.startTime,
        business.timezone
      );

      counts[date] = (counts[date] || 0) + 1;
    }

    return counts;
  }

  async create(businessId, data) {
    const business = await this.#getBusiness(businessId);

    const service =
      await massageAvailabilityService.getBookableService(
        businessId,
        data.massageServiceId
      );

    const startTime = new Date(data.startTime);

    const date = localDateOf(
      startTime,
      business.timezone
    );

    const appointment = await runTransaction(
      async (tx) => {
        const slots =
          await massageAvailabilityService.computeSlots({
            business,
            service,
            date,
            db: tx,
          });

        const slot = slots.find(
          (candidate) =>
            candidate.startMs === startTime.getTime()
        );

        if (!slot) {
          throw new ConflictError(
            "This time is no longer available.",
            ErrorCodes.APPOINTMENT_NOT_AVAILABLE
          );
        }

        const customer =
          await customerService.syncCustomer(
            {
              businessId,
              firstName: data.firstName,
              lastName: data.lastName,
              phoneNumber: data.phoneNumber,
              email: data.email,
            },
            tx
          );

        return massageAppointmentRepository.create(
          {
            businessId,
            customerId: customer.id,
            firstName: customer.firstName,
            lastName: customer.lastName,
            phoneNumber: customer.phoneNumber,
            email: customer.email ?? null,
            massageServiceId: service.id,
            serviceName: service.name,
            durationMinutes: service.durationMinutes,
            priceCents: service.priceCents,
            therapistId: slot.therapist.id,
            roomId: slot.room.id,
            startTime,
            endTime: new Date(
              startTime.getTime() +
                service.durationMinutes * 60_000
            ),
            notes: data.notes ?? null,
            source: data.source ?? "APP",
          },
          tx
        );
      }
    );

    return toDto(appointment);
  }

  async update(businessId, appointmentId, data) {
    const appointment =
      await massageAppointmentRepository.findById(
        appointmentId,
        businessId
      );

    if (!appointment) {
      throw new NotFoundError(
        "Appointment not found.",
        ErrorCodes.APPOINTMENT_NOT_FOUND
      );
    }

    if (
      data.status !== undefined &&
      data.status !== appointment.status
    ) {
      if (appointment.status !== "CONFIRMED") {
        throw new ValidationError(
          "Only a confirmed appointment can change status.",
          ErrorCodes.APPOINTMENT_NOT_CONFIRMED
        );
      }
    }

    const updated =
      await massageAppointmentRepository.update(
        appointmentId,
        data
      );

    return toDto(updated);
  }

  /**
   * Moves a confirmed appointment to another start time.
   *
   * The same rules as a new booking apply: the new time must
   * be free for a therapist and a room. The appointment's
   * own old time does not block the new one. The massage,
   * duration and price stay as they were booked; the
   * therapist and room are chosen again.
   */
  async reschedule(businessId, appointmentId, startTimeInput) {
    const business = await this.#getBusiness(businessId);

    const startTime = new Date(startTimeInput);

    const updated = await runTransaction(async (tx) => {
      const appointment =
        await massageAppointmentRepository.findById(
          appointmentId,
          businessId,
          tx
        );

      if (!appointment) {
        throw new NotFoundError(
          "Appointment not found.",
          ErrorCodes.APPOINTMENT_NOT_FOUND
        );
      }

      if (appointment.status !== "CONFIRMED") {
        throw new ValidationError(
          "Only a confirmed appointment can be moved.",
          ErrorCodes.APPOINTMENT_NOT_CONFIRMED
        );
      }

      const service =
        await massageAvailabilityService.getBookableService(
          businessId,
          appointment.massageServiceId
        );

      const date = localDateOf(
        startTime,
        business.timezone
      );

      const slots =
        await massageAvailabilityService.computeSlots({
          business,
          service: {
            ...service,
            // The duration the customer booked.
            durationMinutes: appointment.durationMinutes,
          },
          date,
          db: tx,
          excludeAppointmentId: appointment.id,
        });

      const slot = slots.find(
        (candidate) =>
          candidate.startMs === startTime.getTime()
      );

      if (!slot) {
        throw new ConflictError(
          "This time is not available.",
          ErrorCodes.APPOINTMENT_NOT_AVAILABLE
        );
      }

      return massageAppointmentRepository.update(
        appointment.id,
        {
          therapistId: slot.therapist.id,
          roomId: slot.room.id,
          startTime,
          endTime: new Date(
            startTime.getTime() +
              appointment.durationMinutes * 60_000
          ),
        },
        tx
      );
    });

    return toDto(updated);
  }

  async #getBusiness(businessId) {
    const business =
      await businessRepository.findById(businessId);

    if (!business) {
      throw new NotFoundError(
        "Business not found.",
        ErrorCodes.BUSINESS_NOT_FOUND
      );
    }

    return business;
  }
}

export default new MassageAppointmentService();
