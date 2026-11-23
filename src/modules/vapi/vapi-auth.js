import { timingSafeEqual } from "node:crypto";

import env from "../../config/env.js";

// ======================================================
// Vapi Authentication
// ======================================================
//
// Every request from Vapi (assistant-request, tool calls)
// carries the shared secret VAPI_SERVER_SECRET, either in
// the x-vapi-secret header (what `npm run vapi:sync`
// configures) or as "Authorization: Bearer <secret>" (a
// Vapi Bearer credential).
//
// Without VAPI_SERVER_SECRET the endpoints are open, but
// only outside production (local development).
// ======================================================

function sameSecret(given, expected) {
  if (typeof given !== "string") {
    return false;
  }

  const a = Buffer.from(given);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

export function secretFromRequest(headers) {
  const header = headers["x-vapi-secret"];

  if (header) {
    return header;
  }

  const authorization = headers.authorization ?? "";

  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : undefined;
}

export function isAuthorizedVapiRequest(
  headers,
  { secret = env.vapiServerSecret, nodeEnv = env.nodeEnv } = {}
) {
  if (!secret) {
    return nodeEnv !== "production";
  }

  return sameSecret(secretFromRequest(headers), secret);
}

/**
 * Fastify preHandler.
 */
export async function requireVapiSecret(request, reply) {
  if (!isAuthorizedVapiRequest(request.headers)) {
    request.log.warn(
      { url: request.url },
      "Vapi request without a valid secret"
    );

    return reply.code(401).send({ error: "Unauthorized" });
  }
}
