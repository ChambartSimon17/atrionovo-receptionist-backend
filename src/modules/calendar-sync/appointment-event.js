// ======================================================
// Appointment event
// ======================================================
//
// Responsibility
// The iCalendar event that copies an appointment into the
// business's own calendar.
//
// Pure: no network, no database.
//
// The UID starts with "atrionovo-", so reading the
// calendar back never turns our own appointments into
// busy blocks (they already block through the database).
// ======================================================

const UID_PREFIX = "atrionovo-";
const UID_DOMAIN = "@atrionovo.com";

const SOURCE_LABELS = {
  AI: "AI-receptie",
  WEB: "website",
  APP: "app",
  WALK_IN: "app",
};

export function appointmentUid(appointmentId) {
  return `${UID_PREFIX}${appointmentId}${UID_DOMAIN}`;
}

export function isOwnEventUid(uid) {
  return typeof uid === "string" && uid.startsWith(UID_PREFIX);
}

export function appointmentFilename(appointmentId) {
  return `${UID_PREFIX}${appointmentId}.ics`;
}

function icsDate(date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

// RFC 5545 3.3.11: escape \ ; , and newlines.
function escapeText(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// RFC 5545 3.1: lines longer than 75 octets are folded.
function fold(line) {
  const bytes = Buffer.from(line, "utf8");

  if (bytes.length <= 75) {
    return line;
  }

  const parts = [];
  let current = "";
  let currentBytes = 0;

  for (const char of line) {
    const size = Buffer.byteLength(char, "utf8");
    const limit = parts.length === 0 ? 75 : 74;

    if (currentBytes + size > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }

    current += char;
    currentBytes += size;
  }

  parts.push(current);

  return parts.join("\r\n ");
}

/**
 * "Hot stone (60 min) – Anna P."
 */
export function appointmentTitle(appointment) {
  const initial = appointment.lastName?.trim()?.[0];

  const name = initial
    ? `${appointment.firstName} ${initial.toUpperCase()}.`
    : appointment.firstName;

  return `${appointment.serviceName} (${appointment.durationMinutes} min) – ${name}`;
}

export function buildAppointmentIcs(appointment, { now = new Date() } = {}) {
  const description = [
    `Tel: ${appointment.phoneNumber}`,
    `Geboekt via AtrioNovo (${SOURCE_LABELS[appointment.source] ?? "app"})`,
  ].join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AtrioNovo//Receptionist//NL",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${appointmentUid(appointment.id)}`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(appointment.startTime)}`,
    `DTEND:${icsDate(appointment.endTime)}`,
    `SUMMARY:${escapeText(appointmentTitle(appointment))}`,
    `DESCRIPTION:${escapeText(description)}`,
    "TRANSP:OPAQUE",
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(fold).join("\r\n") + "\r\n";
}
