// ======================================================
// Call Variables
// ======================================================
//
// The {{variables}} the template prompts in vapi/prompts/
// use, built from a business call profile (see
// resolve-business.js). Same wording as the demo scripts
// used to put in the prompt by hand.
// ======================================================

const DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

const NL_DAYS = {
  MONDAY: "maandag",
  TUESDAY: "dinsdag",
  WEDNESDAY: "woensdag",
  THURSDAY: "donderdag",
  FRIDAY: "vrijdag",
  SATURDAY: "zaterdag",
  SUNDAY: "zondag",
};

/**
 * 600 -> "10 uur", 630 -> "10 uur 30"
 */
export function spokenHour(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest ? `${hours} uur ${rest}` : `${hours} uur`;
}

/**
 * "maandag tot en met vrijdag, van 10 uur tot 22 uur;
 *  zaterdag, van 10 uur 30 tot 20 uur. Op de andere dagen
 *  is de zaak gesloten."
 */
export function openingDaysText(openingHours) {
  const groups = [];

  for (const day of DAYS) {
    const windows = openingHours
      .filter((h) => h.dayOfWeek === day)
      .sort((a, b) => a.opensAtMinutes - b.opensAtMinutes);

    if (!windows.length) {
      continue;
    }

    const key = windows
      .map(
        (w) =>
          `van ${spokenHour(w.opensAtMinutes)} tot ${spokenHour(w.closesAtMinutes)}`
      )
      .join(" en ");

    const last = groups.at(-1);

    if (
      last &&
      last.key === key &&
      DAYS.indexOf(last.days.at(-1)) === DAYS.indexOf(day) - 1
    ) {
      last.days.push(day);
    } else {
      groups.push({ key, days: [day] });
    }
  }

  if (!groups.length) {
    return "Er zijn geen vaste openingsuren bekend.";
  }

  return (
    groups
      .map(({ key, days }) => {
        const first = NL_DAYS[days[0]];
        const lastDay = NL_DAYS[days.at(-1)];

        const spokenDays =
          days.length === 1
            ? first
            : days.length === 2
              ? `${first} en ${lastDay}`
              : `${first} tot en met ${lastDay}`;

        return `${spokenDays}, ${key}`;
      })
      .join("; ") + ". Op de andere dagen is de zaak gesloten."
  );
}

/**
 * Massage names without the duration and without
 * duplicates: "Thaise massage 60 min" and "Thaise massage
 * 90 min" -> "Thaise massage".
 */
export function massageTypesText(names) {
  const types = [];

  for (const name of names) {
    const type = name.replace(/\s+\d+\s*min\.?$/i, "").trim();

    if (type && !types.includes(type)) {
      types.push(type);
    }
  }

  return types.join(", ");
}

export function callVariables(business) {
  const name = business.name.trim();

  // "VOL." at the end of a sentence: no double full stop.
  const nameInSentence = name.replace(/\.$/, "");

  const variables = {
    business_id: business.id,
    zaak_naam: nameInSentence,
    zaak_type: business.businessType,
    openingsuren: openingDaysText(business.openingHours ?? []),
    begroeting: `Hallo, bedankt om ${nameInSentence} te bellen.`,
    tijdzone: business.timezone,
  };

  if (business.businessType === "MASSAGE") {
    variables.massages =
      massageTypesText(business.massageServiceNames ?? []) ||
      "zie het aanbod van de praktijk";
  }

  return variables;
}
