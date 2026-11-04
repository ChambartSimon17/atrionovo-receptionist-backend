# Call log (Gesprekken)

The app shows every call the AI receptionist answered: who called, what came of it
(booked, changed, a question, or call back), the summary, the transcript and the
recording. The backend stores a call when Vapi sends its **end-of-call report**.

## Set up in Vapi (once per assistant)

1. In the Vapi dashboard, open the assistant.
2. Under **Advanced → Server URL**, set:

   ```
   https://atrionovo-receptionist-backend.onrender.com/assistant/call-events?businessId=<BUSINESS_ID>
   ```

   `<BUSINESS_ID>` is the id of the restaurant or salon this assistant answers for.
   The backend also reads `businessId` from the call or assistant `metadata`, so if
   the assistant already passes it there, the query parameter is not needed.

3. Under **Server Messages**, make sure **end-of-call-report** is selected.
4. Optional but recommended: set a **secret** on the server URL and put the same
   value in the Render environment as `VAPI_WEBHOOK_SECRET`. Calls without the
   right `x-vapi-secret` header are then refused.
5. Optional: under **Analysis → Success evaluation**, keep the default rubric.
   A call that fails the evaluation (and made no booking) is marked
   **Terugbellen**, and every phone of the business gets a push notification.

## How the outcome is decided

| Outcome          | When                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| `BOOKED`         | The AI created a reservation or appointment during the call          |
| `CHANGED`        | A booking of the caller's number was moved or cancelled during it    |
| `NEEDS_CALLBACK` | No booking, and Vapi's success evaluation failed                      |
| `INFORMATION`    | Anything else: the caller had a question                             |

Bookings made by the AI are marked with `source = AI`, so **Analyse → Afgehandeld
door de AI** can count reservations, covers, appointments and revenue per period.

## Push notifications

The app registers the phone's Expo push token after login (`POST /auth/push-tokens`).
The backend notifies every phone of the business when:

- the AI makes a reservation or an appointment;
- a call ends as `NEEDS_CALLBACK`.

Push works on a real iPhone with a development or store build; simulators get none.
