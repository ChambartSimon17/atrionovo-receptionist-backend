# Vapi: tools voor een massage-assistent

Maak per massagebedrijf een eigen assistent in Vapi (kopieer je restaurant-assistent) en
koppel het telefoonnummer van dat bedrijf eraan. Vervang in de prompt `[NAAM VAN DE PRAKTIJK]`.

Voor ELKE tool hieronder geldt:

- Method: `POST`
- Base URL: dezelfde als je restaurant-tools (bijvoorbeeld `https://<jouw-backend>`)
- Header: `x-business-id` = het id van het massagebedrijf (te vinden in Prisma Studio, tabel `Restaurant`)
- Static body field: `phoneNumber` = `{{customer.number}}`
  (bij tools waar dat hieronder niet nodig is, helpt het toch: de body is dan nooit leeg)

| Tool-naam            | URL                                   | Parameters (door de AI ingevuld)                                  |
|----------------------|---------------------------------------|-------------------------------------------------------------------|
| getCallerProfile     | `/assistant/massage/caller-profile`   | geen                                                              |
| getServices          | `/assistant/massage/services`         | geen                                                              |
| checkAvailability    | `/assistant/massage/check-availability` | `massageServiceId` (string), `date` (string, YYYY-MM-DD), `time` (string, HH:mm, optioneel) |
| createAppointment    | `/assistant/massage/create-appointment` | `massageServiceId` (string), `startTime` (string, YYYY-MM-DDTHH:mm:00), `firstName` (string), `lastName` (string), `notes` (string, optioneel) |
| rescheduleAppointment| `/assistant/massage/reschedule-appointment` | `appointmentId` (string), `startTime` (string, YYYY-MM-DDTHH:mm:00) |
| cancelAppointment    | `/assistant/massage/cancel-appointment` | `appointmentId` (string)                                          |

`send_text_tool` en `end_call_tool` kan je ongewijzigd hergebruiken.

Beschrijvingen die je in Vapi per parameter kan invullen:

- `massageServiceId`: "Het id van de gekozen massage, uit het resultaat van getServices."
- `date`: "De gewenste dag in het formaat YYYY-MM-DD."
- `time`: "De gewenste tijd in 24 uur, HH:mm. Laat leeg als de klant nog geen tijd koos."
- `startTime`: "Lokaal begin van de afspraak, YYYY-MM-DDTHH:mm:00, zonder tijdzone."
- `appointmentId`: "Het id van de afspraak, uit upcomingAppointments van getCallerProfile."
- `notes`: "Optionele opmerking van de klant voor de masseur."
