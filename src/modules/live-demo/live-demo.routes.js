import { z } from "zod";

import liveDemoService from "./live-demo.service.js";
import { KINDS, LANGUAGES, VOICES } from "./live-demo.assistant.js";

// ======================================================
// Live demo routes (prefix /public/live-demo)
// ======================================================
//
// GET   /status                  is the demo available
// GET   /search?q=               business suggestions
// POST  /sessions                build an assistant
// GET   /sessions/:id            state, polled during a call
// PATCH /sessions/:id            name, voice, language, type
// POST  /sessions/:id/call       call the visitor
// POST  /sessions/:id/lead       "I want to start"
// POST  /vapi/:id?token=         Vapi server messages
//
// The session id is long and random: knowing it is the
// access to that one demo.
// ======================================================

const language = z.enum(LANGUAGES).default("nl");
const sessionToken = z.string().max(100).optional();

const searchSchema = z.object({
  q: z.string().trim().min(2).max(100),
  lang: language,
  token: sessionToken,
});

const createSchema = z.object({
  placeId: z.string().min(10).max(300),
  language,
  sessionToken,
});

const settingsSchema = z.object({
  kind: z.enum(KINDS).optional(),
  assistantName: z.string().trim().min(1).max(30).regex(/^[\p{L} '-]+$/u).optional(),
  voice: z.enum(Object.keys(VOICES)).optional(),
  language: z.enum(LANGUAGES).optional(),
});

const callSchema = z.object({
  phone: z.string().trim().min(6).max(30),
  country: z.enum(["BE", "NL", "LU", "FR"]).default("BE"),
});

const leadSchema = z.object({
  name: z.string().trim().max(100).optional().default(""),
  email: z.string().trim().email().max(200),
});

export default async function liveDemoRoutes(fastify) {
  fastify.get("/status", async () => ({ available: liveDemoService.configured() }));

  fastify.get("/search", async (request) => {
    const { q, lang, token } = searchSchema.parse(request.query ?? {});

    return liveDemoService.search({ query: q, language: lang, sessionToken: token }, request.ip);
  });

  fastify.post("/sessions", async (request) =>
    liveDemoService.create(createSchema.parse(request.body ?? {}), request.ip)
  );

  fastify.get("/sessions/:id", async (request) => liveDemoService.get(request.params.id));

  fastify.patch("/sessions/:id", async (request) =>
    liveDemoService.updateSettings(request.params.id, settingsSchema.parse(request.body ?? {}))
  );

  fastify.post("/sessions/:id/call", async (request) =>
    liveDemoService.call(request.params.id, callSchema.parse(request.body ?? {}), request.ip)
  );

  fastify.post("/sessions/:id/lead", async (request) =>
    liveDemoService.lead(request.params.id, leadSchema.parse(request.body ?? {}))
  );

  fastify.post("/vapi/:id", async (request) =>
    liveDemoService.handleVapiMessage(request.params.id, request.query?.token, request.body, request.log)
  );
}
