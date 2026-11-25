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

const LOCATION = {
  type: "string",
  description: `Alleen als Massage_getServices locaties teruggeeft: de locatie die de klant koos, exact zoals in die lijst (bijvoorbeeld "The Bridge"). Laat anders weg.`,
};

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
    description: `Kijkt of een reservatie voor dit aantal personen op dit moment mogelijk is. Lukt het niet, dan geeft het ook de dichtstbijzijnde vrije uren die dag (alternativeSlots), hetzelfde uur op de volgende dagen (sameTimeOnOtherDays) en, als die middag of avond vol is, de volgende dagen met plaats rond dat uur (nextDaysWithAvailability).`,
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

  findAvailability: {
    businessType: "RESTAURANT",
    description: `Zoekt vrije uren over meerdere dagen, tot drie weken vooruit. Gebruik dit als de klant een andere dag wil ("kan het zaterdag?", "een avond volgende week", "wanneer kan het wel met acht?").`,
    parameters: {
      type: "object",
      properties: {
        guestCount: {
          type: "number",
          description: "Aantal personen.",
        },
        fromDate: {
          type: "string",
          description: "Eerste dag om te zoeken, YYYY-MM-DD. Laat weg om vanaf vandaag te zoeken.",
        },
        time: {
          type: "string",
          description: "Alleen dagen waarop dit uur vrij is, HH:mm in 24 uur. Laat weg als het uur niet uitmaakt.",
        },
        partOfDay: {
          type: "string",
          enum: ["ochtend", "middag", "avond"],
          description: "Alleen een dagdeel. Laat weg als het niet uitmaakt.",
        },
        weekday: {
          type: "string",
          description: "Alleen deze weekdag, bijvoorbeeld zaterdag. Laat weg als het niet uitmaakt.",
        },
      },
      required: ["guestCount"],
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
    description: `Geeft het aanbod van de praktijk: elke massage met id, naam, duur en prijs. Werkt de praktijk op meerdere locaties, dan staan die in locations: vraag de klant dan op welke locatie hij wil komen.`,
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
        location: LOCATION,
      },
      required: ["massageServiceId", "date"],
    },
  },

  Massage_findAvailability: {
    businessType: "MASSAGE",
    description: `Zoekt vrije momenten voor een massage over meerdere dagen. Gebruik dit als de klant een andere dag wil ("is er een andere dag om 17 uur?", "een avond volgende week", "zo snel mogelijk").`,
    parameters: {
      type: "object",
      properties: {
        massageServiceId: {
          type: "string",
          description: "Het id van de gekozen massage, uit het resultaat van Massage_getServices.",
        },
        location: LOCATION,
        fromDate: {
          type: "string",
          description: "Eerste dag om te zoeken, YYYY-MM-DD. Laat weg om vanaf vandaag te zoeken.",
        },
        time: {
          type: "string",
          description: "Alleen dagen waarop dit uur vrij is, HH:mm in 24 uur. Laat weg als het uur niet uitmaakt.",
        },
        partOfDay: {
          type: "string",
          enum: ["ochtend", "middag", "avond"],
          description: "Alleen een dagdeel. Laat weg als het niet uitmaakt.",
        },
        weekday: {
          type: "string",
          description: "Alleen deze weekdag, bijvoorbeeld woensdag. Laat weg als het niet uitmaakt.",
        },
      },
      required: ["massageServiceId"],
    },
  },

  Massage_requestCallback: {
    businessType: "MASSAGE",
    description: `Vraagt de masseur om de beller terug te bellen, in plaats van te boeken. Gebruik dit voor behandelingen die de praktijk alleen na een persoonlijk gesprek inplant (bijvoorbeeld Body Dearmouring). Het telefoonnummer komt automatisch van de oproep.`,
    parameters: {
      type: "object",
      properties: {
        firstName: { type: "string", description: "Voornaam van de beller." },
        lastName: { type: "string", description: "Achternaam van de beller." },
        treatment: { type: "string", description: "Waarvoor de beller teruggebeld wil worden, bijvoorbeeld Body Dearmouring sessie." },
        location: LOCATION,
        message: { type: "string", description: "Wat nuttig is voor het terugbellen: vragen van de beller, wanneer hij liefst gebeld wordt." },
      },
      required: ["firstName", "treatment"],
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
        location: LOCATION,
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
// What the assistant says when a tool starts, as on the In
// A Sense assistant: a short wait phrase for the tools that
// take a moment, nothing for the silent lookups at the start
// of a call. The prompt tells the model not to say it again
// itself.
const SILENT = null;

export const TOOL_START_MESSAGES = {
  getCallerProfile: SILENT,
  checkAvailability: "Een ogenblikje, ik kijk het even na.",
  findAvailability: "Een ogenblikje, ik kijk het even na.",
  createReservation: "Een ogenblikje, ik leg het even vast.",
  updateReservation: "Een ogenblikje, ik pas het even aan.",
  cancelReservation: "Een ogenblikje, ik annuleer het even.",

  Massage_getCallerProfile: SILENT,
  Massage_getServices: SILENT,
  Massage_checkAvailability: "Een ogenblikje, ik kijk het even na.",
  Massage_findAvailability: "Een ogenblikje, ik kijk het even na.",
  Massage_requestCallback: "Een ogenblikje, ik geef het even door.",
  Massage_createAppointment: "Een ogenblikje, ik leg het even vast.",
  Massage_rescheduleAppointment: "Een ogenblikje, ik pas het even aan.",
  Massage_cancelAppointment: "Een ogenblikje, ik annuleer het even.",
};

/**
 * The Vapi "messages" of a shared tool.
 */
export function toolMessages(name) {
  const content = TOOL_START_MESSAGES[name];

  return [
    {
      type: "request-start",
      blocking: false,
      ...(content && { content }),
    },
  ];
}
