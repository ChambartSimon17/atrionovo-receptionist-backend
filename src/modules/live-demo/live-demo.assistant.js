import { DateTime } from "luxon";

// ======================================================
// The demo assistant
// ======================================================
//
// Builds the Vapi assistant for one live demo: what it
// knows (Google profile and website), how it speaks
// (language, voice, name) and the one tool it can use, a
// pretend booking. It is created per call (a "transient"
// assistant), so nothing has to be set up in Vapi.
// ======================================================

export const KINDS = ["restaurant", "salon", "other"];
export const LANGUAGES = ["nl", "fr", "en"];

export const VOICES = {
  warm: { label: "Sarah", voiceId: "EXAVITQu4vr4xnSDxMaL" },
  calm: { label: "George", voiceId: "JBFqnCBsd6RMkjVDRZzb" },
};

const LANGUAGE_NAMES = { nl: "Dutch (Belgian, use 'u')", fr: "French (Belgian)", en: "English" };

const RESTAURANT_TYPES = /restaurant|cafe|bar|bistro|brasserie|bakery|food|meal|pizza|sushi|steak|diner/;
const SALON_TYPES = /spa|massage|beauty|salon|hair|nail|wellness|sauna|physiotherap|skin|barber|tanning|yoga/;

/**
 * restaurant, salon or other, from the Google types.
 */
export function guessKind(place) {
  const types = [place.primaryType, ...(place.types ?? [])].filter(Boolean).join(" ");

  if (SALON_TYPES.test(types)) {
    return "salon";
  }

  if (RESTAURANT_TYPES.test(types)) {
    return "restaurant";
  }

  return "other";
}

const FIRST_MESSAGES = {
  nl: (business, name) => `Goeiedag, ${business}, u spreekt met ${name}, de digitale assistent. Waarmee kan ik u helpen?`,
  fr: (business, name) => `Bonjour, ${business}, vous parlez avec ${name}, l'assistante numérique. Comment puis-je vous aider ?`,
  en: (business, name) => `Hello, ${business}, you're speaking with ${name}, the digital assistant. How can I help you?`,
};

const WHAT_TO_BOOK = {
  restaurant: "a table: the guest's name, the date, the time and the number of people",
  salon: "an appointment: the client's name, the treatment, the date and the time",
  other: "an appointment: the caller's name, what it is for, the date and the time",
};

function systemPrompt(session) {
  const { place, website, settings } = session;
  const now = DateTime.now().setZone("Europe/Brussels");

  return `You are ${settings.assistantName}, the AI phone receptionist of "${place.name}", ${place.address}.

This is a live demo of AtrioNovo, an AI receptionist for Belgian businesses. The person on the phone is probably the owner, playing a customer. Behave exactly like the real receptionist of this business would: friendly, calm, efficient.

Language: speak ${LANGUAGE_NAMES[settings.language]}. If the caller clearly speaks another language, switch to it.

Now: ${now.setLocale("en").toFormat("cccc d LLLL yyyy, HH:mm")} (Brussels time).

How you speak on the phone:
- Short answers, one or two sentences. One question at a time.
- Say dates and times the way people say them, never "2026-11-10".
- Never read out a web address, list or long text.

What you can do:
- Answer questions with the information below. When something is not in it (a price, a dish, a treatment), say that you will have the full menu and house rules once you are live, and offer to book or to have someone call back. Never invent prices or facts.
- Book ${WHAT_TO_BOOK[settings.kind]}. Only book when the business is open at that moment, according to the opening hours. Repeat the details briefly, and when the caller agrees, call the tool makeBooking. After the tool answers, tell the caller the booking is confirmed and a confirmation text message is on its way.
- When the caller has nothing more, say goodbye in one sentence, add that this was a demo of AtrioNovo and the conversation is on their screen, and end the call.

Information about the business:
Type: ${place.typeLabel ?? settings.kind}
Phone: ${place.phone ?? "unknown"}
Website: ${place.website ?? "none"}
Rating on Google: ${place.rating ? `${place.rating} (${place.ratingCount} reviews)` : "unknown"}
Opening hours:
${place.openingHours.length > 0 ? place.openingHours.join("\n") : "unknown; assume usual opening hours for this type of business"}
${place.summary ? `\nAbout: ${place.summary}\n` : ""}
From the website:
${website.text || "(the website could not be read)"}`;
}

const BOOKING_TOOL = {
  type: "function",
  function: {
    name: "makeBooking",
    description: "Books the table or appointment once the caller confirmed the details.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The name of the guest or client." },
        date: { type: "string", description: "The date, as YYYY-MM-DD." },
        time: { type: "string", description: "The time, as HH:mm (24 hours)." },
        partySize: { type: "integer", description: "Number of people, for a table." },
        service: { type: "string", description: "The treatment or what the appointment is for." },
        notes: { type: "string", description: "Allergies, wishes or other notes." },
      },
      required: ["name", "date", "time"],
    },
  },
};

const TRANSCRIBERS = {
  nl: { provider: "deepgram", model: "nova-2", language: "nl" },
  fr: { provider: "deepgram", model: "nova-2", language: "fr" },
  en: { provider: "deepgram", model: "nova-3", language: "en" },
};

/**
 * The full Vapi assistant for a demo call.
 */
export function buildAssistant(session, { serverUrl, model }) {
  const { place, settings } = session;

  return {
    name: "AtrioNovo live demo",
    firstMessage: FIRST_MESSAGES[settings.language](place.name, settings.assistantName),
    firstMessageMode: "assistant-speaks-first",
    maxDurationSeconds: 240,
    silenceTimeoutSeconds: 30,
    model: {
      provider: "openai",
      model,
      temperature: 0.4,
      messages: [{ role: "system", content: systemPrompt(session) }],
      tools: [BOOKING_TOOL, { type: "endCall" }],
    },
    voice: {
      provider: "11labs",
      model: "eleven_turbo_v2_5",
      voiceId: VOICES[settings.voice].voiceId,
    },
    transcriber: TRANSCRIBERS[settings.language],
    server: { url: serverUrl },
    serverMessages: ["conversation-update", "status-update", "tool-calls", "end-of-call-report"],
    analysisPlan: {
      summaryPlan: {
        messages: [
          {
            role: "system",
            content: `Summarise this phone call in one or two sentences, in ${LANGUAGE_NAMES[settings.language]}, for the business owner.`,
          },
          { role: "user", content: "Here is the transcript:\n\n{{transcript}}\n\n" },
        ],
      },
    },
    metadata: { liveDemoSessionId: session.id },
  };
}

/**
 * What the visitor sees under "What the assistant knows".
 */
export function knowledge(session) {
  const { place, website } = session;

  return {
    typeLabel: place.typeLabel,
    openingHours: place.openingHours,
    phone: place.phone,
    website: place.website,
    pages: website.pages,
    excerpt: website.text.replace(/^## .*$/gm, "").replace(/\s+/g, " ").trim().slice(0, 400),
  };
}
