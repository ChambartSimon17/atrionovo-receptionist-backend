
import prisma from "../../db/prisma.js";

const OFF_MESSAGE =
  "Bedankt voor uw telefoontje. We kunnen momenteel niet opnemen. Gelieve het later opnieuw te proberen. Bedankt voor uw begrip.";

function twimlResponse(xml) {
  return {
    statusCode: 200,
    headers: {
      "content-type": "text/xml; charset=utf-8",
    },
    body: xml,
  };
}

export default async function incomingCallRoutes(fastify) {
  fastify.post("/incoming-call", async (request, reply) => {
    const calledNumber = request.body?.To;
    const normalizedNumber = String(calledNumber ?? "").replace(
      /[\s()-]/g,
      ""
    );

    if (!normalizedNumber) {
      return reply.code(400).send({
        error: "Missing Twilio To number",
      });
    }

    // Temporary safeguard: don't guess which restaurant
    // owns a number. We must add an explicit number mapping.
    fastify.log.warn(
      { calledNumber: normalizedNumber },
      "Incoming-call routing needs a phone-number-to-restaurant mapping"
    );

    return reply
      .code(501)
      .type("application/json")
      .send({
        error: "Phone number mapping is not configured yet",
      });
  });
}
