import env from "../../config/env.js";
import { answerAssistantRequest } from "./assistant-request.js";
import { requireVapiSecret } from "./vapi-auth.js";
import { handleToolCalls } from "./vapi-tools.js";

// ======================================================
// Vapi Routes (multi-tenant)
// ======================================================
//
//   POST /vapi/assistant-request   server URL of every Vapi
//                                  number
//   POST /vapi/tools               server URL of every
//                                  shared tool
//
// Both require the Vapi secret (vapi-auth.js). The old
// per-demo routes under /assistant keep working next to
// these until every number is moved.
// ======================================================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * TEST ONLY: fail on purpose, to test the fallback on the
 * Vapi number. Set VAPI_SIMULATE_ASSISTANT_REQUEST_FAILURE
 * on Render, or add ?simulate=error|hang to the server URL
 * of one number in Vapi (only that number is affected).
 */
function simulatedFailure(request) {
  const mode =
    request.query?.simulate ?? env.vapiSimulateAssistantRequestFailure;

  return ["error", "hang"].includes(mode) ? mode : null;
}

export default async function vapiRoutes(fastify) {
  fastify.addHook("preHandler", requireVapiSecret);

  fastify.post("/assistant-request", async (request, reply) => {
    const started = process.hrtime.bigint();
    const elapsedMs = () =>
      Number((process.hrtime.bigint() - started) / 1_000_000n);

    const message = request.body?.message ?? request.body;

    if (message?.type && message.type !== "assistant-request") {
      // Other server messages for the number: nothing to do.
      return reply.send({});
    }

    const simulate = simulatedFailure(request);

    if (simulate) {
      request.log.warn(
        { simulate, phoneNumberId: message?.call?.phoneNumberId },
        "Vapi assistant-request: simulated failure"
      );

      if (simulate === "hang") {
        // Longer than Vapi waits (7.5 s).
        await sleep(15_000);
      }

      return reply.code(500).send({ error: "Simulated failure" });
    }

    const { body, outcome, businessId, error } =
      await answerAssistantRequest(message);

    const durationMs = elapsedMs();

    request.log[outcome === "assistant" ? "info" : "warn"](
      {
        vapi: "assistant-request",
        outcome,
        businessId,
        phoneNumberId: message?.call?.phoneNumberId ?? null,
        callId: message?.call?.id ?? null,
        durationMs,
        err: error,
      },
      `Vapi assistant-request ${outcome} in ${durationMs} ms`
    );

    reply.header("server-timing", `app;dur=${durationMs}`);

    return reply.send(body);
  });

  fastify.post("/tools", async (request, reply) => {
    const message = request.body?.message ?? request.body;

    const body = await handleToolCalls(message, { log: request.log });

    // Always 200: Vapi reads success/failure per result.
    return reply.send(body);
  });
}
