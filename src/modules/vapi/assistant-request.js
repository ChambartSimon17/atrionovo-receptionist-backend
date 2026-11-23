import env from "../../config/env.js";
import { callVariables } from "./call-variables.js";
import {
  callReferences,
  lastKnownBusinessForPhoneNumberId,
  resolveBusinessFromCall,
} from "./resolve-business.js";
import { transcriberFor } from "./vapi-config.js";

// ======================================================
// Assistant Request
// ======================================================
//
// Responsibility
// Answer Vapi's "assistant-request" for an incoming call:
// which template assistant takes the call, filled with the
// values of the business that owns the called number.
//
// The caller hears silence until we answer, and Vapi gives
// up after 7.5 seconds (fixed). So:
// - one indexed lookup (Business.vapiPhoneNumberId), cached
//   in memory for a few minutes;
// - our own deadline (VAPI_ASSISTANT_REQUEST_DEADLINE_MS,
//   default 5 s): when the lookup is slower, we answer with
//   the fallback instead of letting Vapi time out;
// - never throws: every failure becomes a fallback answer.
//
// Fallback, in this order
// 1. Transfer to the business's own number
//    (Business.fallbackPhoneNumber), also from the last
//    known cache entry when the database is down.
// 2. The generic assistant VAPI_ASSISTANT_FALLBACK.
// 3. { error }: Vapi speaks the message and, when the Vapi
//    number has a fallbackDestination, transfers there.
// ======================================================

const UNAVAILABLE_MESSAGE =
  "Bedankt voor uw telefoontje. We kunnen momenteel niet opnemen. Gelieve later opnieuw te proberen.";

function templateAssistantId(businessType) {
  return {
    RESTAURANT: env.vapiAssistantRestaurant,
    MASSAGE: env.vapiAssistantMassage,
  }[businessType];
}

export function fallbackResponse(business) {
  if (business?.fallbackPhoneNumber) {
    return {
      destination: {
        type: "number",
        number: business.fallbackPhoneNumber,
        message: "",
      },
    };
  }

  if (env.vapiAssistantFallback) {
    return { assistantId: env.vapiAssistantFallback };
  }

  return { error: UNAVAILABLE_MESSAGE };
}

export function assistantResponse(business) {
  const assistantId = templateAssistantId(business.businessType);

  if (!assistantId) {
    return null;
  }

  const assistantOverrides = {
    variableValues: callVariables(business),
    // Read back by the end-of-call-report handler.
    metadata: { businessId: business.id },
  };

  const transcriber = transcriberFor(business.transcriberKeyterms);

  if (transcriber) {
    assistantOverrides.transcriber = transcriber;
  }

  return { assistantId, assistantOverrides };
}

class DeadlineError extends Error {}

function withDeadline(promise, ms) {
  let timer;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new DeadlineError(`No answer within ${ms} ms`)),
        ms
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * @returns {Promise<{ body: object, outcome: string, businessId: string|null }>}
 */
export async function answerAssistantRequest(
  message,
  { deadlineMs = env.vapiAssistantRequestDeadlineMs } = {}
) {
  const { phoneNumberId } = callReferences(message);

  try {
    const { business } = await withDeadline(
      resolveBusinessFromCall(message),
      deadlineMs
    );

    if (!business) {
      return {
        body: fallbackResponse(null),
        outcome: "unknown-number",
        businessId: null,
      };
    }

    if (!business.voiceAgentEnabled) {
      return {
        body: fallbackResponse(business),
        outcome: "voice-agent-disabled",
        businessId: business.id,
      };
    }

    const body = assistantResponse(business);

    if (!body) {
      return {
        body: fallbackResponse(business),
        outcome: "no-template-assistant",
        businessId: business.id,
      };
    }

    return { body, outcome: "assistant", businessId: business.id };
  } catch (error) {
    // Database slow or down: use what we last knew.
    const lastKnown = phoneNumberId
      ? lastKnownBusinessForPhoneNumberId(phoneNumberId)
      : null;

    return {
      body: fallbackResponse(lastKnown),
      outcome:
        error instanceof DeadlineError ? "deadline-exceeded" : "error",
      businessId: lastKnown?.id ?? null,
      error,
    };
  }
}
