// ======================================================
// Vapi Tool Definitions
// ======================================================
//
// The shared function tools, as the LLM sees them. One set
// for all businesses: none of them takes a business id or
// the caller's phone number. The backend reads both from
// the Vapi call (see resolve-business.js).
//
// Used by:
// - src/modules/vapi/vapi-tools.js   (handlers, by name)
// - scripts/vapi/sync.mjs            (creates/updates the
//                                      tools in Vapi)
//
// The names stay the same as before, so the prompts do not
// change.
// ======================================================

const LOCAL_DATETIME = `Lokale tijd van de zaak, exact in het formaat YYYY-MM-DDTHH:mm:ss, bijvoorbeeld 2026-10-07T18:00:00.
Zonder Z, zonder tijdzone, zonder milliseconden. Reken nooit om naar UTC: de backend doet dat.
Zegt de klant 18 uur, stuur dan 18:00:00.`;

const NO_ARGUMENTS = {
  type: "object",
  properties: {},
  required: [],
};

export const TOOL_DEFINITIONS = {
  // ====================================================
  // Restaurant
  // ====================================================

  getCallerProfile: {
    businessType: "RESTAURANT",
    description: `Haalt het profiel en de komende reservaties van de beller op. Het telefoonnummer komt automatisch van de oproep.

VERPLICHTE EERSTE ACTIE: roep deze tool meteen aan het begin van ELKE oproep aan, vóór de begroeting en vóór elke andere tool.`,
    parameters: NO_ARGUMENTS,
  },

  checkAvailability: {
    businessType: "RESTAURANT",
    description: `Kijkt of een reservatie voor dit aantal personen op dit moment mogelijk is.`,
    parameters: {
      type: "object",
      properties: {
        guestCount: {
          type: "number",
          description: "Aantal personen.",
        },
        startTime: {
          type: "string",
          description: LOCAL_DATETIME,
        },
      },
      required: ["guestCount", "startTime"],
    },
  },

  createReservation: {
    businessType: "RESTAURANT",
    description: `Maakt een reservatie. Pas aanroepen nadat de klant de samenvatting bevestigd heeft. Het telefoonnummer komt automatisch van de oproep.`,
    parameters: {
      type: "object",
      properties: {
        firstName: { type: "string", description: "Voornaam van de klant." },
        lastName: { type: "string", description: "Achternaam van de klant." },
        guestCount: { type: "number", description: "Aantal personen." },
        startTime: { type: "string", description: LOCAL_DATETIME },
        notes: {
          type: "string",
          description: "Optionele opmerking van de klant (allergie, kinderstoel, ...).",
        },
      },
      required: ["firstName", "lastName", "guestCount", "startTime"],
    },
  },

  updateReservation: {
    businessType: "RESTAURANT",
    description: `Wijzigt het moment en/of het aantal personen van een bestaande reservatie. Pas aanroepen na bevestiging van de klant.`,
    parameters: {
      type: "object",
      properties: {
        reservationId: {
          type: "string",
          description: "Het id van de reservatie, uit upcomingReservations van getCallerProfile.",
        },
        guestCount: { type: "number", description: "Aantal personen." },
        startTime: { type: "string", description: LOCAL_DATETIME },
      },
      required: ["reservationId", "guestCount", "startTime"],
    },
  },

  cancelReservation: {
    businessType: "RESTAURANT",
    description: `Annuleert een bestaande reservatie. Pas aanroepen nadat de klant bevestigd heeft welke reservatie geannuleerd moet worden.`,
    parameters: {
      type: "object",
      properties: {
        reservationId: {
          type: "string",
          description: "Het id van de reservatie, uit upcomingReservations van getCallerProfile.",
        },
      },
      required: ["reservationId"],
    },
  },

  // ====================================================
  // Massage
  // ====================================================

  Massage_getCallerProfile: {
    businessType: "MASSAGE",
    description: `Haalt het profiel en de komende afspraken van de beller op. Het telefoonnummer komt automatisch van de oproep.

VERPLICHTE EERSTE ACTIE: roep deze tool meteen aan het begin van ELKE oproep aan, vóór de begroeting en vóór elke andere tool.`,
    parameters: NO_ARGUMENTS,
  },

  Massage_getServices: {
    businessType: "MASSAGE",
    description: `Geeft het aanbod van de praktijk: elke massage met id, naam, duur en prijs.`,
    parameters: NO_ARGUMENTS,
  },

  Massage_checkAvailability: {
    businessType: "MASSAGE",
    description: `Geeft de vrije tijden voor een massage op een dag, en of het gevraagde uur vrij is.`,
    parameters: {
      type: "object",
      properties: {
        massageServiceId: {
          type: "string",
          description: "Het id van de gekozen massage, uit het resultaat van Massage_getServices.",
        },
        date: {
          type: "string",
          description: "De gewenste dag in het formaat YYYY-MM-DD.",
        },
        time: {
          type: "string",
          description: "De gewenste tijd in 24 uur, HH:mm. Laat weg als de klant nog geen tijd koos.",
        },
      },
      required: ["massageServiceId", "date"],
    },
  },

  Massage_createAppointment: {
    businessType: "MASSAGE",
    description: `Boekt een massage. Pas aanroepen nadat de klant de samenvatting bevestigd heeft. Het telefoonnummer komt automatisch van de oproep.`,
    parameters: {
      type: "object",
      properties: {
        massageServiceId: {
          type: "string",
          description: "Het id van de gekozen massage, uit het resultaat van Massage_getServices.",
        },
        startTime: { type: "string", description: LOCAL_DATETIME },
        firstName: { type: "string", description: "Voornaam van de klant." },
        lastName: { type: "string", description: "Achternaam van de klant." },
        notes: {
          type: "string",
          description: "Optionele opmerking van de klant voor de masseur.",
        },
      },
      required: ["massageServiceId", "startTime", "firstName", "lastName"],
    },
  },

  Massage_rescheduleAppointment: {
    businessType: "MASSAGE",
    description: `Verplaatst een afspraak van de beller naar een nieuw moment. Pas aanroepen na bevestiging van de klant.`,
    parameters: {
      type: "object",
      properties: {
        appointmentId: {
          type: "string",
          description: "Het id van de afspraak, uit upcomingAppointments van Massage_getCallerProfile.",
        },
        startTime: { type: "string", description: LOCAL_DATETIME },
      },
      required: ["appointmentId", "startTime"],
    },
  },

  Massage_cancelAppointment: {
    businessType: "MASSAGE",
    description: `Annuleert een afspraak van de beller. Pas aanroepen na een duidelijk ja van de klant.`,
    parameters: {
      type: "object",
      properties: {
        appointmentId: {
          type: "string",
          description: "Het id van de afspraak, uit upcomingAppointments van Massage_getCallerProfile.",
        },
      },
      required: ["appointmentId"],
    },
  },
};

// The prompt already has the assistant say "een momentje,
// ik kijk het even na" once. Vapi only adds this when a
// tool is slow, so the caller never hears silence.
export const TOOL_DELAYED_MESSAGE = {
  type: "request-response-delayed",
  content: "Nog heel even geduld, ik ben het aan het nakijken.",
  timingMilliseconds: 4000,
};
