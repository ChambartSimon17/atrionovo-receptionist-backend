# Vapi: één set tools, één sjabloon-assistant per type

Elke klant heeft een eigen Belgisch Vapi-nummer. Bij een inkomende oproep vraagt Vapi
aan de backend welke assistant opneemt (`POST /vapi/assistant-request`). De backend zoekt
de zaak op via het gebelde nummer en antwoordt met het sjabloon voor dat type, ingevuld
met de gegevens van die zaak. Tijdens het gesprek roepen de gedeelde tools
`POST /vapi/tools` aan, en de backend bepaalt de zaak opnieuw uit de call.

```
oproep → Vapi-nummer ──assistant-request──▶ /vapi/assistant-request
                                              zaak via call.phoneNumberId
                     ◀── { assistantId: sjabloon, assistantOverrides: {
                           variableValues, metadata, transcriber (keyterms) } }
gesprek ──tool-calls──▶ /vapi/tools           zaak via call.phoneNumberId,
                                              beller via call.customer.number
einde   ──end-of-call-report──▶ /assistant/call-events
```

| Bestand | Wat |
| --- | --- |
| `vapi/prompts/restaurant.nl.md`, `massage.nl.md` | prompts met `{{zaak_naam}}`, `{{openingsuren}}`, `{{massages}}` |
| `vapi/config.json` | stem, model, transcriber (Vlaams), timeouts, toolnamen per type |
| `vapi/ids.json` | Vapi-ids van de tools en sjablonen (door `vapi:sync` geschreven, commit dit) |
| `src/modules/vapi/` | resolver, assistant-request, tools, auth |
| `scripts/vapi/sync.mjs` | `npm run vapi:sync`: git → Vapi |
| `scripts/vapi/business.mjs` | `npm run vapi:business`: nummer, fallback en keyterms van een zaak |

## Klanten blijven af

`vapi/customers.json` is de lijst van live klanten met hun eigen opzet (nu: In A Sense, Cindy).
`vapi-switch` weigert die zaken en nummers, `vapi:sync --numbers` slaat ze over en
`vapi:business` verplaatst hun nummer niet. Bewust toch (bv. een klant later naar deze opzet
overzetten): `--customer=<businessId>`. Zet elke nieuwe klant in die lijst op de dag dat hij
live gaat.

## Variabelen die de prompt kan gebruiken

`business_id`, `zaak_naam`, `zaak_type`, `openingsuren`, `massages` (alleen massage),
`begroeting`, `tijdzone`. Ze worden bij elke oproep live uit de database gehaald (2 min cache).

## Uitrollen

1. **Render, Environment** (vóór de deploy):
   - `VAPI_SERVER_SECRET`: een lange willekeurige string (`openssl rand -hex 32`). Zet
     dezelfde waarde in je lokale `.env`.
   - `VAPI_ASSISTANT_RESTAURANT` en `VAPI_ASSISTANT_MASSAGE`: die vul je in na stap 3.
   - Optioneel: `VAPI_ASSISTANT_FALLBACK`, `VAPI_ASSISTANT_REQUEST_DEADLINE_MS` (5000),
     `VAPI_BUSINESS_CACHE_SECONDS` (120).
2. **Branch mergen en deployen.** De migratie `20261123120000_vapi_phone_routing` voegt drie
   kolommen toe en verwijdert niets. De oude `/assistant/*`-routes blijven werken.
3. `npm run vapi:sync -- --dry-run`, daarna `npm run vapi:sync`. Dit maakt 11 tools en 2
   sjablonen aan. Zet de getoonde ids op Render (stap 1) en commit `vapi/ids.json`.
4. Zaak koppelen aan een nummer:
   `npm run vapi:business -- <slug> --number=<vapi phone number id> --fallback=+32... --keyterms "Naam" "Gemeente"`
5. Nummer omzetten: `npm run vapi:sync -- --numbers --only=<vapi phone number id>`
   (de vaste assistant gaat eraf, de server-URL wordt `/vapi/assistant-request`, met fallback).

Terugdraaien voor één nummer: zet in het dashboard bij dat nummer opnieuw de oude assistant.

## Timeouts

| Wat | Waarde | Waar |
| --- | --- | --- |
| assistant-request | eigen deadline 5 s, daarna fallback-antwoord | backend (`VAPI_ASSISTANT_REQUEST_DEADLINE_MS`) |
| assistant-request, Vapi zelf | 7,5 s, vast, niet instelbaar | Vapi |
| tools | 15 s; na 4 s zegt de assistant "Nog heel even geduld…" | `vapi:sync` |
| call-events | 20 s | `vapi:sync` |

Voor assistant-request bestaat geen instelbare timeout: Vapi wacht altijd hoogstens 7,5 s.
`server.timeoutSeconds: 5` op het nummer wordt wel gezet, maar volgens de docs negeert Vapi
dat voor assistant-request. De backend antwoordt daarom zelf binnen 5 s.

## Fallback

1. De backend kent de zaak, maar kan ze niet bedienen (stem uitgeschakeld, database traag of
   plat met een gekende cache): de oproep gaat naar `fallbackPhoneNumber`.
2. Onbekend nummer zonder fallback: `VAPI_ASSISTANT_FALLBACK`, anders `{ error }`. Vapi
   spreekt die boodschap uit.
3. De backend antwoordt niet of geeft een fout (down, deploy, 500): Vapi gebruikt de
   `fallbackDestination` van het nummer (door `vapi:sync` gezet). Zonder fallbackDestination
   wordt opgehangen.

De Vapi-docs spreken elkaar hier tegen. De pagina van het nummer zegt dat een mislukte
assistant-request naar `fallbackDestination` gaat. De events-pagina zegt dat de oproep
eindigt met `assistant-request-returned-error`. Test 4 hieronder beslist dat.

## Testen met het demonummer

Het gedeelde demonummer is +32 460 23 71 90 (Vapi-id `7df5d118-7a1b-42c0-bc78-076b17133ffe`).
+32 460 25 28 25 is sinds 2026-11-23 van In A Sense (Cindy), een klant: nooit gebruiken om te testen.

1. `node scripts/demo/vapi-switch.mjs scripts/demo/demos/<slug>.json` (zet het nummer en de
   keyterms op de demozaak), eenmalig gevolgd door `npm run vapi:sync -- --numbers --only=7df5d118-7a1b-42c0-bc78-076b17133ffe`.
2. **Gewone oproep.** Bel het nummer. Verwacht: de begroeting met de naam van de zaak. In de
   Render-logs staat `Vapi assistant-request assistant in N ms` (doel < 500 ms). In Vapi →
   Logs → Calls → Variables staan de ingevulde waarden.
3. **Tools.** Vraag naar het aanbod, boek, verplaats en annuleer. Elke stap staat in de
   Render-logs als `Vapi tool call` met `via: "phoneNumberId"`. De afspraak verschijnt in de
   app, en het gesprek na afloop ook.
4. **Fallback, backend geeft een fout.** Zet in het Vapi-dashboard bij het nummer de server-URL
   op `…/vapi/assistant-request?simulate=error`. Bel. Verwacht: doorgeschakeld naar je gsm.
   Gebeurt dat niet en wordt er opgehangen, dan geldt voor `{error}` de "eindigt"-variant uit de
   docs. Zet dan een fallback-assistant (`VAPI_ASSISTANT_FALLBACK`).
5. **Fallback, backend antwoordt niet.** Zelfde met `?simulate=hang` (de backend wacht 15 s,
   Vapi geeft het na 7,5 s op). Verwacht: na ±7,5 s stilte doorgeschakeld naar je gsm.
6. Zet de server-URL terug zonder `?simulate=` (of `npm run vapi:sync -- --numbers --only=<id>`).
7. **Keyterms.** Spreek een moeilijke naam uit. Vapi → Logs → transcript moet ze juist
   schrijven.

## Dashboard: wat je nog zelf doet

- **SMS-afzender.** `send_text_tool` (`86e65269…`) heeft een vast afzendnummer:
  `metadata.from = +32460237190` (de restaurantdemo). In de gedeelde opzet sturen dus alle
  zaken sms'en vanaf dat nummer. Kijk in het dashboard of `from` leeg mag (dan neemt Vapi
  hopelijk het gebelde nummer) of maak per nummer een sms-tool. Het sync-script laat deze tool
  ongemoeid.
- **Oude tools en assistants** (`Massage Business v.0.1.0`, `AtrioNovo v.0.1.0` en de
  apiRequest-tools) laat je staan tot alle nummers omgezet zijn. Verwijder ze daarna in het
  dashboard.
- **Controle na `vapi:sync`.** Open een sjabloon-assistant en kijk of stem, transcriber
  (Flemish), model en de 7 tools kloppen. Kijk ook of de tools onder "Server" de header
  `x-vapi-secret` tonen.
