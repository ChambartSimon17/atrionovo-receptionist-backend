import assistantService from "../assistant/assistant.service.js";
import assistantMassageService from "../assistant/assistant-massage.service.js";
import {
  checkAvailabilitySchema,
  findAvailabilitySchema,
  createReservationSchema,
  updateReservationSchema,
  cancelReservationSchema,
} from "../assistant/assistant.validator.js";
import {
  massageCheckAvailabilitySchema,
  massageFindAvailabilitySchema,
  massageRequestCallbackSchema,
  massageCreateAppointmentSchema,
  massageRescheduleAppointmentSchema,
  massageCancelAppointmentSchema,
} from "../assistant/assistant-massage.validator.js";
import { TOOL_DEFINITIONS } from "./tool-definitions.js";
import {
  callerNumberOf,
  resolveBusinessFromCall,
} from "./resolve-business.js";

// ======================================================
// Vapi Tools
// ======================================================
//
// Responsibility
// Handle Vapi "tool-calls" messages for the shared tools.
//
// Vapi sends
//   { message: { type: "tool-calls", call, toolCallList:
//     [{ id, function: { name, arguments } }] } }
// and expects HTTP 200 with
//   { results: [{ toolCallId, name, result | error }] }
// where result/error is a flat string.
//
// The business comes from the call (resolveBusinessFromCall),
// the caller's number from call.customer.number. Neither is
// ever taken from the LLM's arguments.
//
// The handlers reuse the existing assistant services, so a
// phone booking follows exactly the same rules as before.
// ======================================================

const HANDLERS = {
  // Restaurant
  getCallerProfile: ({ business, callerNumber }) =>
    callerNumber
      ? assistantService.getCallerProfile({
          businessId: business.id,
          phoneNumber: callerNumber,
        })
      : unknownCaller("upcomingReservations"),

  checkAvailability: ({ business, args }) =>
    assistantService.checkAvailability({
      businessId: business.id,
      ...checkAvailabilitySchema.parse(args),
    }),

  findAvailability: ({ business, args }) =>
    assistantService.findAvailability({
      businessId: business.id,
      ...findAvailabilitySchema.parse(args),
    }),

  createReservation: ({ business, args, callerNumber }) =>
    assistantService.createReservation({
      businessId: business.id,
      ...createReservationSchema.parse({
        ...args,
        phoneNumber: requireCallerNumber(callerNumber),
      }),
    }),

  updateReservation: ({ business, args }) =>
    assistantService.updateReservation({
      businessId: business.id,
      ...updateReservationSchema.parse(args),
    }),

  cancelReservation: ({ business, args }) =>
    assistantService.cancelReservation({
      businessId: business.id,
      ...cancelReservationSchema.parse(args),
    }),

  // Massage
  Massage_getCallerProfile: ({ business, callerNumber }) =>
    callerNumber
      ? assistantMassageService.getCallerProfile({
          businessId: business.id,
          phoneNumber: callerNumber,
        })
      : unknownCaller("upcomingAppointments"),

  Massage_getServices: ({ business }) =>
    assistantMassageService.getServices({
      businessId: business.id,
    }),

  Massage_checkAvailability: ({ business, args }) =>
    assistantMassageService.checkAvailability({
      businessId: business.id,
      ...massageCheckAvailabilitySchema.parse(args),
    }),

  Massage_findAvailability: ({ business, args }) =>
    assistantMassageService.findAvailability({
      businessId: business.id,
      ...massageFindAvailabilitySchema.parse(args),
    }),

  Massage_requestCallback: ({ business, args, callerNumber }) =>
    assistantMassageService.requestCallback({
      businessId: business.id,
      ...massageRequestCallbackSchema.parse({
        ...args,
        phoneNumber: callerNumber ?? undefined,
      }),
    }),

  Massage_createAppointment: ({ business, args, callerNumber }) =>
    assistantMassageService.createAppointment({
      businessId: business.id,
      ...massageCreateAppointmentSchema.parse({
        ...args,
        phoneNumber: requireCallerNumber(callerNumber),
      }),
    }),

  Massage_rescheduleAppointment: ({ business, args, callerNumber }) =>
    assistantMassageService.rescheduleAppointment({
      businessId: business.id,
      ...massageRescheduleAppointmentSchema.parse({
        ...args,
        phoneNumber: requireCallerNumber(callerNumber),
      }),
    }),

  Massage_cancelAppointment: ({ business, args, callerNumber }) =>
    assistantMassageService.cancelAppointment({
      businessId: business.id,
      ...massageCancelAppointmentSchema.parse({
        ...args,
        phoneNumber: requireCallerNumber(callerNumber),
      }),
    }),
};

class ToolError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function unknownCaller(listName) {
  return {
    customerFound: false,
    customer: null,
    [listName]: [],
  };
}

function requireCallerNumber(callerNumber) {
  if (!callerNumber) {
    throw new ToolError(
      "Het telefoonnummer van de beller is niet bekend (geen telefoonoproep). Vraag de klant om de zaak rechtstreeks te bellen.",
      "CALLER_NUMBER_MISSING"
    );
  }

  return callerNumber;
}

/**
 * Arguments arrive as an object; some providers send a
 * JSON string. Empty strings from optional fields are
 * dropped, like the old apiRequest tools did with their
 * defaults.
 */
export function parseArguments(raw) {
  let args = raw ?? {};

  if (typeof args === "string") {
    try {
      args = args.trim() ? JSON.parse(args) : {};
    } catch {
      throw new ToolError("Ongeldige argumenten.", "INVALID_ARGUMENTS");
    }
  }

  if (typeof args !== "object" || Array.isArray(args)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(args).filter(
      ([, value]) => value !== "" && value !== null && value !== undefined
    )
  );
}

function toolCallsOf(message) {
  if (Array.isArray(message?.toolCallList)) {
    return message.toolCallList;
  }

  if (Array.isArray(message?.toolWithToolCallList)) {
    return message.toolWithToolCallList.map((t) => t.toolCall);
  }

  return [];
}

function describeError(error) {
  if (error?.name === "ZodError") {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      message: "Ongeldige of ontbrekende gegevens.",
      errors: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  // Business-rule errors (AppError subclasses, ToolError)
  // carry a code the prompt knows (RESTAURANT_CLOSED, ...).
  if (error?.code) {
    return {
      success: false,
      code: error.code,
      message: error.message,
    };
  }

  return {
    success: false,
    code: "INTERNAL_ERROR",
    message: "Er ging iets mis aan onze kant.",
  };
}

/**
 * Runs all tool calls of one Vapi message.
 *
 * @returns {{ results: Array }} the HTTP 200 body for Vapi
 */
export async function handleToolCalls(message, { log } = {}) {
  const toolCalls = toolCallsOf(message);

  const { business, via } = await resolveBusinessFromCall(message);
  const callerNumber = callerNumberOf(message);

  const results = await Promise.all(
    toolCalls.map(async (toolCall) => {
      const name = toolCall?.function?.name ?? toolCall?.name;
      const toolCallId = toolCall?.id;
      const started = Date.now();

      try {
        const handler = HANDLERS[name];

        if (!handler) {
          throw new ToolError(`Onbekende tool: ${name}.`, "UNKNOWN_TOOL");
        }

        if (!business) {
          throw new ToolError(
            "De zaak van deze oproep is niet gevonden.",
            "BUSINESS_NOT_FOUND"
          );
        }

        if (TOOL_DEFINITIONS[name].businessType !== business.businessType) {
          throw new ToolError(
            "Deze tool hoort niet bij dit soort zaak.",
            "WRONG_BUSINESS_TYPE"
          );
        }

        const args = parseArguments(
          toolCall?.function?.arguments ?? toolCall?.arguments
        );

        const data = await handler({ business, args, callerNumber });

        log?.info?.(
          {
            tool: name,
            businessId: business.id,
            via,
            durationMs: Date.now() - started,
          },
          "Vapi tool call"
        );

        return {
          toolCallId,
          name,
          result: JSON.stringify({ success: true, data }),
        };
      } catch (error) {
        const described = describeError(error);

        const level =
          described.code === "INTERNAL_ERROR" ? "error" : "warn";

        log?.[level]?.(
          {
            tool: name,
            businessId: business?.id ?? null,
            code: described.code,
            err: level === "error" ? error : undefined,
            durationMs: Date.now() - started,
          },
          "Vapi tool call failed"
        );

        // A business-rule answer ("restaurant gesloten") is
        // a normal result the assistant must explain. Only
        // real failures go in `error`.
        return described.code === "INTERNAL_ERROR"
          ? { toolCallId, name, error: JSON.stringify(described) }
          : { toolCallId, name, result: JSON.stringify(described) };
      }
    })
  );

  return { results };
}
