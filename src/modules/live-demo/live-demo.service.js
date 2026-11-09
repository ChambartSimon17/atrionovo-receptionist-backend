import crypto from "node:crypto";

import { DateTime } from "luxon";
import { parsePhoneNumberFromString } from "libphonenumber-js";

import env from "../../config/env.js";
import { sendMail } from "../invoicing/mailer.js";
import { autocomplete, placeDetails, placesConfigured } from "./google-places.js";
import { readWebsite } from "./website-reader.js";
import { buildAssistant, guessKind, knowledge, VOICES } from "./live-demo.assistant.js";

// ======================================================
// Live demo
// ======================================================
//
// The "hear it for your own business" demo on
// atrionovo.com:
//
//   1. search        the visitor types a business name
//   2. create        Google profile + website -> session
//   3. call          Vapi calls the visitor's phone
//   4. events        Vapi reports the conversation, the
//                    pretend booking and the end
//   5. sms           the booking confirmation by text
//
// Sessions live in memory for two hours: a demo needs no
// database, and a restart only ends running demos.
//
// Calls cost money and reach real phones, so they are
// limited: Benelux and French numbers only, no premium
// numbers, a few calls per number and per visitor a day,
// and a cap on all demo calls per day.
// ======================================================

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const COUNTRIES = ["BE", "NL", "LU", "FR"];
const PHONE_TYPES = ["MOBILE", "FIXED_LINE", "FIXED_LINE_OR_MOBILE"];

const LIMITS = {
  search: { count: 150, window: HOUR_MS },
  create: { count: 15, window: HOUR_MS },
  callPerIp: { count: 4, window: DAY_MS },
  callPerPhone: { count: 2, window: DAY_MS },
};

const sessions = new Map();
const hits = new Map();
let dailyCalls = { day: "", count: 0 };

class DemoError extends Error {
  constructor(message, code, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function limit(kind, key) {
  const { count, window } = LIMITS[kind];
  const id = `${kind}:${key}`;
  const now = Date.now();
  const times = (hits.get(id) ?? []).filter((time) => now - time < window);

  if (times.length >= count) {
    throw new DemoError("Too many requests. Try again later.", "TOO_MANY_REQUESTS", 429);
  }

  times.push(now);
  hits.set(id, times);
}

function takeDailyCall() {
  const today = DateTime.now().setZone("Europe/Brussels").toISODate();

  if (dailyCalls.day !== today) {
    dailyCalls = { day: today, count: 0 };
  }

  if (dailyCalls.count >= env.liveDemoDailyCalls) {
    throw new DemoError("The demo is very busy today. Try again tomorrow.", "DEMO_DAILY_LIMIT", 429);
  }

  dailyCalls.count += 1;
}

function cleanUp() {
  const now = Date.now();

  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }

  for (const [id, times] of hits) {
    if (times.every((time) => now - time > DAY_MS)) {
      hits.delete(id);
    }
  }
}

setInterval(cleanUp, 10 * 60 * 1000).unref();

function getSession(id) {
  const session = sessions.get(id);

  if (!session) {
    throw new DemoError("This demo has expired. Start again.", "DEMO_NOT_FOUND", 404);
  }

  return session;
}

/**
 * What the website shows of a session.
 */
function publicView(session) {
  return {
    id: session.id,
    place: {
      name: session.place.name,
      address: session.place.address,
      rating: session.place.rating,
      ratingCount: session.place.ratingCount,
      openNow: session.place.openNow,
      openingHours: session.place.openingHours,
      phone: session.place.phone,
      website: session.place.website,
      photos: session.place.photos,
    },
    knowledge: knowledge(session),
    settings: session.settings,
    voices: Object.fromEntries(Object.entries(VOICES).map(([key, voice]) => [key, voice.label])),
    call: session.call && {
      status: session.call.status,
      startedAt: session.call.startedAt,
      endedAt: session.call.endedAt,
      endedReason: session.call.endedReason,
      messages: session.call.messages,
      booking: session.call.booking,
      smsSent: session.call.smsSent,
      summary: session.call.summary,
    },
  };
}

// ----------------------------------------------------
// Text message
// ----------------------------------------------------

function smsConfigured() {
  return Boolean(env.twilioAccountSid && env.twilioAuthToken && env.twilioSmsFrom);
}

const SMS = {
  nl: ({ business, what, when, detail }) =>
    `${business}: uw ${what} op ${when}${detail} is bevestigd. Dit was een demo van AtrioNovo, er is niets echt geboekt. atrionovo.com`,
  fr: ({ business, what, when, detail }) =>
    `${business} : votre ${what} le ${when}${detail} est confirmé${what === "réservation" ? "e" : ""}. Ceci était une démo d'AtrioNovo, rien n'a été réservé. atrionovo.com/fr/`,
  en: ({ business, what, when, detail }) =>
    `${business}: your ${what} on ${when}${detail} is confirmed. This was an AtrioNovo demo, nothing was actually booked. atrionovo.com`,
};

const WHAT = {
  nl: { restaurant: "reservatie", other: "afspraak" },
  fr: { restaurant: "réservation", other: "rendez-vous" },
  en: { restaurant: "reservation", other: "appointment" },
};

function smsText(session, booking) {
  const { language, kind } = session.settings;
  const when = DateTime.fromISO(`${booking.date}T${booking.time}`, { zone: "Europe/Brussels" })
    .setLocale(language === "nl" ? "nl-BE" : language === "fr" ? "fr-BE" : "en-GB")
    .toFormat(language === "en" ? "ccc d LLL 'at' HH:mm" : "ccc d LLL 'om' HH:mm")
    .replace(" om ", language === "fr" ? " à " : " om ");

  const detail = booking.partySize
    ? ` (${booking.partySize} ${language === "nl" ? "pers." : language === "fr" ? "pers." : "people"})`
    : booking.service
      ? ` (${booking.service})`
      : "";

  return SMS[language]({
    business: session.place.name,
    what: WHAT[language][kind === "restaurant" ? "restaurant" : "other"],
    when,
    detail,
  });
}

async function sendSms(to, body) {
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.twilioAccountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: env.twilioSmsFrom, Body: body }),
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.message || `Twilio answered ${response.status}.`);
  }
}

// ----------------------------------------------------
// Vapi messages
// ----------------------------------------------------

function toMessages(list) {
  return (list ?? [])
    .filter((item) => ["bot", "assistant", "user"].includes(item.role) && item.message)
    .map((item) => ({
      from: item.role === "user" ? "caller" : "ai",
      text: String(item.message).trim(),
    }));
}

const ENDED_STATUSES = ["ended"];

class LiveDemoService {
  configured() {
    return placesConfigured() && Boolean(env.vapiApiKey && env.liveDemoPhoneNumberId);
  }

  async search({ query, language, sessionToken }, ip) {
    this.#assertConfigured();
    limit("search", ip);

    return { results: await autocomplete(query, { language, sessionToken }) };
  }

  async create({ placeId, language, sessionToken }, ip) {
    this.#assertConfigured();
    limit("create", ip);

    const place = await placeDetails(placeId, { language, sessionToken });
    const website = await readWebsite(place.website);

    const session = {
      id: crypto.randomBytes(18).toString("base64url"),
      hookToken: crypto.randomBytes(18).toString("base64url"),
      createdAt: Date.now(),
      ip,
      place,
      website,
      settings: {
        kind: guessKind(place),
        assistantName: language === "fr" ? "Camille" : language === "en" ? "Emma" : "Lisa",
        voice: "warm",
        language,
      },
      call: null,
    };

    sessions.set(session.id, session);

    return publicView(session);
  }

  get(id) {
    return publicView(getSession(id));
  }

  updateSettings(id, settings) {
    const session = getSession(id);

    if (session.call && !ENDED_STATUSES.includes(session.call.status)) {
      throw new DemoError("The call is still running.", "DEMO_CALL_RUNNING", 409);
    }

    session.settings = { ...session.settings, ...settings };

    return publicView(session);
  }

  async call(id, { phone, country }, ip) {
    const session = getSession(id);

    if (session.call && !ENDED_STATUSES.includes(session.call.status)) {
      throw new DemoError("The call is still running.", "DEMO_CALL_RUNNING", 409);
    }

    const parsed = parsePhoneNumberFromString(phone, country);

    if (!parsed?.isValid() || !COUNTRIES.includes(parsed.country) || !PHONE_TYPES.includes(parsed.getType() ?? "FIXED_LINE_OR_MOBILE")) {
      throw new DemoError("Use a Belgian, Dutch, Luxembourg or French phone number.", "DEMO_PHONE_INVALID");
    }

    const number = parsed.number;

    limit("callPerIp", ip);
    limit("callPerPhone", number);
    takeDailyCall();

    session.phone = number;
    session.call = {
      status: "queued",
      startedAt: null,
      endedAt: null,
      endedReason: null,
      messages: [],
      booking: null,
      smsSent: false,
      summary: null,
      reported: false,
    };

    const serverUrl = `${env.publicBaseUrl}/public/live-demo/vapi/${session.id}?token=${session.hookToken}`;

    const response = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.vapiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phoneNumberId: env.liveDemoPhoneNumberId,
        customer: { number },
        assistant: buildAssistant(session, { serverUrl, model: env.liveDemoModel }),
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      session.call.status = "failed";
      session.call.endedReason = "call-not-started";
      throw new DemoError(
        Array.isArray(data?.message) ? data.message.join(" ") : data?.message || "The call could not be started.",
        "DEMO_CALL_FAILED",
        502
      );
    }

    session.call.vapiCallId = data.id;

    return publicView(session);
  }

  /**
   * A server message from Vapi about a demo call.
   */
  async handleVapiMessage(id, token, body, log) {
    const session = sessions.get(id);

    if (!session || token !== session.hookToken || !session.call) {
      return { ok: false };
    }

    const message = body?.message ?? {};
    const call = session.call;

    switch (message.type) {
      case "status-update": {
        call.status = message.status === "in-progress" ? "in-progress" : message.status ?? call.status;

        if (message.status === "in-progress" && !call.startedAt) {
          call.startedAt = new Date().toISOString();
        }

        if (message.status === "ended") {
          call.endedAt ??= new Date().toISOString();
          call.endedReason ??= message.endedReason ?? null;
        }

        return { ok: true };
      }

      case "conversation-update": {
        const messages = toMessages(message.messages);

        if (messages.length >= call.messages.length) {
          call.messages = messages;
        }

        return { ok: true };
      }

      case "tool-calls": {
        const results = await Promise.all(
          (message.toolCallList ?? []).map(async (toolCall) => ({
            toolCallId: toolCall.id,
            result: await this.#runTool(session, toolCall, log),
          }))
        );

        return { results };
      }

      case "end-of-call-report": {
        call.status = "ended";
        call.endedAt ??= new Date().toISOString();
        call.endedReason = message.endedReason ?? call.endedReason;
        call.summary = message.analysis?.summary ?? message.summary ?? null;

        const messages = toMessages(message.artifact?.messages ?? message.messages);

        if (messages.length > call.messages.length) {
          call.messages = messages;
        }

        void this.#reportToTeam(session, log);

        return { ok: true };
      }

      default:
        return { ok: true };
    }
  }

  /**
   * After the demo: the visitor wants to start.
   */
  async lead(id, { name, email }) {
    const session = getSession(id);

    await sendMail({
      fromName: "AtrioNovo live demo",
      replyTo: email,
      to: env.demoInbox,
      subject: `Wil starten na de live demo: ${session.place.name}`,
      text: [
        `Naam: ${name || "-"}`,
        `E-mail: ${email}`,
        `Telefoon (demo): ${session.phone ?? "-"}`,
        "",
        `Zaak: ${session.place.name}`,
        `Adres: ${session.place.address}`,
        `Website: ${session.place.website ?? "-"}`,
        `Type: ${session.settings.kind}, taal: ${session.settings.language}`,
        "",
        `Samenvatting van de oproep: ${session.call?.summary ?? "-"}`,
      ].join("\n"),
    });

    return { success: true };
  }

  async #runTool(session, toolCall, log) {
    const name = toolCall.function?.name ?? toolCall.name;
    let args = toolCall.function?.arguments ?? toolCall.arguments ?? {};

    if (typeof args === "string") {
      try {
        args = JSON.parse(args);
      } catch {
        args = {};
      }
    }

    if (name !== "makeBooking") {
      return "Unknown tool.";
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date ?? "") || !/^\d{1,2}:\d{2}$/.test(args.time ?? "")) {
      return "The date or time is missing. Ask the caller again.";
    }

    const booking = {
      name: String(args.name ?? "").slice(0, 80),
      date: args.date,
      time: args.time.padStart(5, "0"),
      partySize: Number.isInteger(args.partySize) ? args.partySize : null,
      service: args.service ? String(args.service).slice(0, 80) : null,
      notes: args.notes ? String(args.notes).slice(0, 200) : null,
    };

    session.call.booking = booking;

    if (smsConfigured() && session.phone) {
      try {
        await sendSms(session.phone, smsText(session, booking));
        session.call.smsSent = true;
      } catch (error) {
        log?.warn?.({ error: error.message }, "Live demo SMS not sent");
      }
    }

    return session.call.smsSent
      ? "Booked. A confirmation text message has been sent to the caller."
      : "Booked.";
  }

  async #reportToTeam(session, log) {
    if (session.call.reported) {
      return;
    }

    session.call.reported = true;

    try {
      await sendMail({
        fromName: "AtrioNovo live demo",
        to: env.demoInbox,
        subject: `Live demo: ${session.place.name}`,
        text: [
          `${session.place.name}, ${session.place.address}`,
          `Website: ${session.place.website ?? "-"}`,
          `Gebeld naar: ${session.phone}`,
          `Taal: ${session.settings.language}, type: ${session.settings.kind}`,
          `Geboekt: ${session.call.booking ? "ja" : "nee"}`,
          "",
          `Samenvatting: ${session.call.summary ?? "-"}`,
          "",
          ...session.call.messages.map((line) => `${line.from === "ai" ? "AI" : "Beller"}: ${line.text}`),
        ].join("\n"),
      });
    } catch (error) {
      log?.warn?.({ error: error.message }, "Live demo report not mailed");
    }
  }

  #assertConfigured() {
    if (!this.configured()) {
      throw new DemoError("The live demo is not available right now.", "DEMO_NOT_CONFIGURED", 503);
    }
  }
}

export default new LiveDemoService();
