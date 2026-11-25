// Puts the shared demo number on a demo account (multi-tenant, see
// vapi/README.md). Nothing in the assistants or tools changes: one
// template assistant per type takes every call, and the backend fills
// in the business of the called number.
//
//   1. refuses live customers (vapi/customers.json)
//   2. database: the demo number goes to this business (taken away
//      from the previous demo), keyterms from the config, phone
//      assistant on
//   3. checks that the demo number in Vapi asks our backend
//      (/vapi/assistant-request) and has no fixed assistant
//   4. asks the backend which business it now answers with, and shows
//      what the assistant will say (name, opening days, massages)
//
// Usage: node scripts/demo/vapi-switch.mjs scripts/demo/demos/<slug>.json [--dry-run]
//
// Massage and restaurant demos share ONE number: only the last switched
// demo is live. The backend remembers a number for up to 2 minutes
// (VAPI_BUSINESS_CACHE_SECONDS), so the switch can take that long.
import { API, loadConfig, loadEnv, prisma as openProductionDb } from "./lib.mjs";
import { cleanKeyterms } from "../../src/modules/vapi/vapi-config.js";
import { callVariables } from "../../src/modules/vapi/call-variables.js";
import { refuseCustomer } from "../vapi/customers.mjs";

export const DEMO_NUMBER = "+32460237190";

const config = loadConfig(process.argv[2]);
const dryRun = process.argv.includes("--dry-run");
if (!config.businessId) throw new Error("Maak eerst het account aan (create-account.mjs).");

// ---------- 1. never a customer ----------
refuseCustomer(config.businessId, `Zaak ${config.name}`);
refuseCustomer(DEMO_NUMBER, `Demonummer ${DEMO_NUMBER}`);

await loadEnv(".env");
const KEY = process.env.VAPI_API_KEY;
const SECRET = process.env.VAPI_SERVER_SECRET;
if (!KEY) throw new Error("VAPI_API_KEY ontbreekt in .env");

async function vapi(method, path) {
  const res = await fetch(`https://api.vapi.ai${path}`, { method, headers: { Authorization: `Bearer ${KEY}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Vapi ${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

const number = (await vapi("GET", "/phone-number")).find((n) => n.number === DEMO_NUMBER);
if (!number) throw new Error(`Demonummer ${DEMO_NUMBER} niet gevonden in Vapi`);
refuseCustomer(number.id, `Demonummer ${DEMO_NUMBER}`);

// ---------- 2. database ----------
const db = await openProductionDb();
let business;
try {
  const keyterms = cleanKeyterms(config.keyterms ?? []);
  const holder = await db.business.findUnique({ where: { vapiPhoneNumberId: number.id }, select: { id: true, name: true } });
  if (holder) refuseCustomer(holder.id, `Het demonummer staat nu bij ${holder.name}, en die`);

  console.log(`demonummer ${DEMO_NUMBER}: ${holder ? holder.name : "(niemand)"} -> ${config.name}`);
  console.log(`keyterms (${keyterms.length}): ${keyterms.join(" | ") || "-"}`);

  if (!dryRun) {
    await db.$transaction(async (tx) => {
      await tx.business.updateMany({
        where: { vapiPhoneNumberId: number.id, NOT: { id: config.businessId } },
        data: { vapiPhoneNumberId: null },
      });
      await tx.business.update({
        where: { id: config.businessId },
        data: { vapiPhoneNumberId: number.id, transcriberKeyterms: keyterms, voiceAgentEnabled: true },
      });
    });
  }

  business = await db.business.findUnique({
    where: { id: config.businessId },
    select: {
      id: true, name: true, businessType: true, timezone: true,
      openingHours: { select: { dayOfWeek: true, opensAtMinutes: true, closesAtMinutes: true } },
      massageServices: { where: { isActive: true }, select: { name: true }, orderBy: { name: "asc" } },
    },
  });
} finally {
  await db.$disconnect();
}

// What the template prompt gets for this business.
const variables = callVariables({ ...business, massageServiceNames: business.massageServices.map((s) => s.name) });
console.log(`\nwat de assistant krijgt (${business.businessType.toLowerCase()}):`);
console.log(`  zaak: ${variables.zaak_naam}`);
console.log(`  openingsdagen: ${variables.openingsuren}`);
if (variables.massages) console.log(`  massages: ${variables.massages}`);

// ---------- 3. number in Vapi ----------
const routedToBackend = !number.assistantId && !number.squadId && number.server?.url === `${API}/vapi/assistant-request`;
if (!routedToBackend) {
  console.log(`\n! Het demonummer gaat nog niet via de backend (vaste assistant ${number.assistantId ?? "-"}).`);
  console.log(`  Eenmalig: npm run vapi:sync -- --numbers --only=${number.id}`);
  process.exitCode = 1;
}

if (dryRun) {
  console.log("\ndry run: niets aangepast");
  process.exit();
}

// ---------- 4. what the backend answers ----------
if (routedToBackend && SECRET) {
  const res = await fetch(`${API}/vapi/assistant-request`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-vapi-secret": SECRET },
    body: JSON.stringify({ message: { type: "assistant-request", call: { phoneNumberId: number.id } } }),
  });
  const answer = await res.json().catch(() => ({}));
  const answeredFor = answer.assistantOverrides?.metadata?.businessId;
  if (answeredFor === config.businessId) {
    console.log(`\nklaar: ${DEMO_NUMBER} neemt nu op als ${variables.zaak_naam}. Bel om te testen.`);
  } else {
    console.log(`\nbijna klaar: de backend antwoordt nog met de vorige zaak (${answeredFor ?? JSON.stringify(answer).slice(0, 120)}).`);
    console.log("  Dat is de cache: binnen 2 minuten neemt het nummer op als " + variables.zaak_naam + ".");
  }
} else if (routedToBackend) {
  console.log(`\nklaar in de database. (VAPI_SERVER_SECRET ontbreekt in .env, dus de backend is niet nagevraagd.)`);
}
