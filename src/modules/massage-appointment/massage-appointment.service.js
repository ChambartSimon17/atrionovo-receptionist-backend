import massageAppointmentRepository from "./massage-appointment.repository.js";
import massageAvailabilityService from "./massage-availability.service.js";
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
