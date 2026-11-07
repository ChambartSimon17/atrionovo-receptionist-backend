import { z } from "zod";

import env from "../../config/env.js";
import { sendMail } from "../invoicing/mailer.js";

// ======================================================
// Website routes
// ======================================================
//
// POST /public/demo-request
//
// The "Demo aanvragen" form on atrionovo.com. Mails the
// request to the AtrioNovo team, with the sender as
// reply-to. A hidden field catches bots, and every IP
// address may send a few requests per hour.
// ======================================================

const text = (max) => z.string().trim().max(max);

const requestSchema = z.object({
  name: text(100).min(1),
  business: text(150).min(1),
  email: z.string().trim().email().max(200),
  phone: text(40).optional().default(""),
  sector: z.enum(["restaurant", "massage", "other"]).optional().default("other"),
  plan: z.enum(["", "start", "pro", "groei"]).optional().default(""),
  message: text(2000).optional().default(""),
  website: z.string().optional().default(""),
});

const SECTORS = { restaurant: "Restaurant", massage: "Massage & wellness", other: "Iets anders" };
const LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;
const recent = new Map();

function allowed(ip) {
  const now = Date.now();
  const times = (recent.get(ip) ?? []).filter((time) => now - time < WINDOW_MS);

  times.push(now);
  recent.set(ip, times);

  return times.length <= LIMIT;
}

export default async function websiteRoutes(fastify) {
  fastify.post("/demo-request", async (request, reply) => {
    const data = requestSchema.parse(request.body ?? {});

    // Bots fill in the hidden field; pretend it worked.
    if (data.website) {
      return reply.send({ success: true });
    }

    if (!allowed(request.ip)) {
      return reply.status(429).send({
        success: false,
        message: "Too many requests. Try again later.",
        code: "TOO_MANY_REQUESTS",
      });
    }

    const lines = [
      `Naam: ${data.name}`,
      `Zaak: ${data.business}`,
      `Type: ${SECTORS[data.sector]}`,
      `Pakket: ${data.plan || "weet het nog niet"}`,
      `E-mail: ${data.email}`,
      `Telefoon: ${data.phone || "-"}`,
      "",
      data.message || "(geen bericht)",
    ];

    try {
      await sendMail({
        fromName: "AtrioNovo website",
        replyTo: data.email,
        to: env.demoInbox,
        subject: `Demo-aanvraag: ${data.business} (${SECTORS[data.sector]})`,
        text: lines.join("\n"),
      });
    } catch (error) {
      request.log.error(error, "demo request not mailed");

      return reply.status(503).send({
        success: false,
        message: "The request could not be sent.",
        code: "MAIL_FAILED",
      });
    }

    return reply.send({ success: true });
  });
}
