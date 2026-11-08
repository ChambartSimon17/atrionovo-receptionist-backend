import { DateTime } from "luxon";

import prisma from "../../db/prisma.js";

// ======================================================
// Push notifications
// ======================================================
//
// Sends a notification to every phone logged in for a
// business, through the Expo push service. A failure is
// logged and never breaks the request that caused it:
// a booking stays made when a phone cannot be reached.
// ======================================================

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const SOURCE_LABELS = {
  AI: "via de AI",
  WEB: "online",
};

function fullName({ firstName, lastName }) {
  return [firstName, lastName].filter(Boolean).join(" ");
}

// "vr 13 nov · 19:30", in the time zone of the business.
function formatWhen(startTime, timezone) {
  return DateTime.fromJSDate(new Date(startTime))
    .setZone(timezone)
    .setLocale("nl-BE")
    .toFormat("ccc d LLL · HH:mm")
    .replace(/\./g, "");
}

class PushService {
  async registerToken(userId, token) {
    if (
      typeof token !== "string" ||
      !/^Expo(nent)?PushToken\[.+\]$/.test(token)
    ) {
      return null;
    }

    return prisma.pushToken.upsert({
      where: { token },
      create: { userId, token },
      update: { userId },
    });
  }

  async removeToken(userId, token) {
    await prisma.pushToken.deleteMany({
      where: { userId, token },
    });
  }

  /**
   * A reservation made by the AI or on the booking page.
   * Not awaited by the caller's response: a slow push
   * service never delays a phone call or a booking.
   */
  notifyNewReservation(business, reservation, source, log) {
    return this.notifyBusiness(
      business.id,
      {
        title: `Nieuwe reservatie ${SOURCE_LABELS[source]}`,
        body: `${fullName(reservation)} · ${reservation.guestCount} pers. · ${formatWhen(reservation.startTime, business.timezone)}`,
        data: {
          type: "reservation",
          reservationId: reservation.id,
        },
      },
      log
    );
  }

  /**
   * A massage appointment made by the AI or on the
   * booking page.
   */
  notifyNewAppointment(business, appointment, source, log) {
    return this.notifyBusiness(
      business.id,
      {
        title: `Nieuwe afspraak ${SOURCE_LABELS[source]}`,
        body: `${fullName(appointment)} · ${appointment.serviceName} · ${formatWhen(appointment.startTime, business.timezone)}${appointment.therapistName ? ` · ${appointment.therapistName}` : ""}`,
        data: {
          type: "appointment",
          appointmentId: appointment.id,
        },
      },
      log
    );
  }

  /**
   * @param {string} businessId
   * @param {{ title: string, body: string, data?: object }} message
   */
  async notifyBusiness(businessId, message, log = console) {
    try {
      const tokens = await prisma.pushToken.findMany({
        where: { user: { businessId } },
      });

      if (tokens.length === 0) {
        return;
      }

      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(
          tokens.map(({ token }) => ({
            to: token,
            sound: "default",
            title: message.title,
            body: message.body,
            data: message.data ?? {},
          }))
        ),
      });

      const result = await response.json().catch(() => null);

      // Forget phones that uninstalled the app.
      const stale = (result?.data ?? [])
        .map((ticket, index) =>
          ticket?.details?.error === "DeviceNotRegistered"
            ? tokens[index]?.token
            : null
        )
        .filter(Boolean);

      if (stale.length > 0) {
        await prisma.pushToken.deleteMany({
          where: { token: { in: stale } },
        });
      }
    } catch (error) {
      log.warn?.({ error }, "Push notification failed");
    }
  }
}

export default new PushService();
