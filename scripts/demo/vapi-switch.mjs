// Points the Vapi demo assistant (massage or restaurant) to a
// demo account:
//   1. fills the prompt template (only name, opening days and,
//      for massage, the types of massage) and puts it on the
//      assistant
//   2. sets x-business-id on every tool of that assistant
//   3. sets the server URL, so the calls show up in the app
//   3b. points the shared demo number to that assistant (massage
//      and restaurant demos share one number)
// Everything that was there before is saved in
// scripts/demo/backups/ first.
//
// Usage: node scripts/demo/vapi-switch.mjs scripts/demo/demos/<slug>.json [--dry-run]
//
// Note: massage and restaurant demos share ONE demo number, so only
// the last switched demo (of either type) is live.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { API, ROOT, loadConfig, loadEnv, openingDaysText } from "./lib.mjs";

export const ASSISTANTS = {
  // +32 460 25 28 25 is since 2026-11-23 the number of In A Sense (Cindy),
  // with its own assistant 6274f041-… . Massage demos need another number.
  MASSAGE: { id: "b2edb84c-4382-4661-899b-b1a0ce31a22b", template: "docs/vapi/massage-prompt.template.nl.md", phone: "+32 460 23 71 90" },
  RESTAURANT: { id: "1dd35e22-4c13-42c0-a928-f9bb176c8629", template: "docs/vapi/restaurant-prompt.template.nl.md", phone: "+32 460 23 71 90" },
};

// Live customers: never switch these to a demo.
const CUSTOMER_ASSISTANTS = ["6274f041-d1dc-41e5-b6af-d54c4713e932"]; // In A Sense (Cindy)
const CUSTOMER_NUMBERS = ["+32460252825"]; // In A Sense (Cindy)
for (const a of Object.values(ASSISTANTS)) {
  if (CUSTOMER_ASSISTANTS.includes(a.id) || CUSTOMER_NUMBERS.includes(a.phone?.replace(/\s/g, ""))) {
    throw new Error(`vapi-switch mag nooit de assistant of het nummer van een klant aanpassen (${a.id} / ${a.phone})`);
  }
}

const config = loadConfig(process.argv[2]);
const dryRun = process.argv.includes("--dry-run");
if (!config.businessId) throw new Error("Maak eerst het account aan (create-account.mjs).");

await loadEnv(".env");
const KEY = process.env.VAPI_API_KEY;
if (!KEY) throw new Error("VAPI_API_KEY ontbreekt in .env");

async function vapi(method, path, body) {
  const res = await fetch(`https://api.vapi.ai${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Vapi ${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

// ---------- prompt ----------
const target = ASSISTANTS[config.type];
const spoken = config.spokenName ?? config.name;
const values = {
  PRAKTIJK: spoken,
  ZAAK: spoken,
  OPENINGSDAGEN: openingDaysText(config),
  MASSAGES: (config.services ?? []).map((s) => s.type).join(", "),
};
let prompt = readFileSync(join(ROOT, target.template), "utf8").replace(/^<!--[\s\S]*?-->\n/, "");
prompt = prompt.replace(/\[\[([A-Z]+)\]\]/g, (_, key) => {
  if (!values[key]) throw new Error(`Geen waarde voor [[${key}]]`);
  return values[key];
});
// "VOL." at the end of a sentence: no double full stop.
if (spoken.endsWith(".")) prompt = prompt.replaceAll(`${spoken}.`, spoken);

const promptFile = config.__path.replace(/\.json$/, ".prompt.md");
writeFileSync(promptFile, prompt);
console.log("prompt:", promptFile);
console.log("  zaak:", spoken);
console.log("  openingsdagen:", values.OPENINGSDAGEN);
if (config.type === "MASSAGE") console.log("  massages:", values.MASSAGES);

// ---------- current state + backup ----------
const assistant = await vapi("GET", `/assistant/${target.id}`);
const tools = await Promise.all((assistant.model?.toolIds ?? []).map((id) => vapi("GET", `/tool/${id}`)));
// Older restaurant tools carry x-restaurant-id instead of
// x-business-id (the backend maps it, see legacy-restaurant-compat).
const HEADERS = ["x-business-id", "x-restaurant-id"];
const headerOf = (t) => HEADERS.find((h) => t.headers?.properties?.[h]);
const withHeader = tools.filter(headerOf);

const backups = join(ROOT, "scripts/demo/backups");
mkdirSync(backups, { recursive: true });
const backupFile = join(backups, `${new Date().toISOString().replace(/[:.]/g, "-")}-${config.type.toLowerCase()}.json`);
writeFileSync(backupFile, JSON.stringify({ assistant, tools }, null, 2));
console.log("backup:", backupFile);

const serverUrl = `${API}/assistant/call-events?businessId=${config.businessId}`;
console.log(`tools met x-business-id/x-restaurant-id: ${withHeader.length} (${withHeader.map((t) => t.function?.name ?? t.name).join(", ")})`);

console.log(`demonummer: ${target.phone} gaat naar de ${config.type.toLowerCase()}-assistant (gedeeld nummer, de vorige demo is daarna niet meer bereikbaar)`);

if (dryRun) {
  console.log("dry run: niets aangepast in Vapi");
  process.exit(0);
}

// ---------- apply ----------
const [system, ...rest] = assistant.model.messages ?? [];
await vapi("PATCH", `/assistant/${target.id}`, {
  model: { ...assistant.model, messages: [{ ...(system ?? { role: "system" }), content: prompt }, ...rest] },
  server: { ...(assistant.server ?? {}), url: serverUrl },
  serverMessages: [...new Set([...(assistant.serverMessages ?? []), "end-of-call-report"])],
});

for (const tool of withHeader) {
  const headers = structuredClone(tool.headers);
  headers.properties[headerOf(tool)].value = config.businessId;
  await vapi("PATCH", `/tool/${tool.id}`, { headers });
}

// ---------- shared demo number -> this assistant ----------
const demoPhone = target.phone.replace(/\s/g, "");
const allNumbers = await vapi("GET", "/phone-number");
const demoNumberInVapi = allNumbers.find((n) => n.number === demoPhone);
if (!demoNumberInVapi) throw new Error(`Demonummer ${demoPhone} niet gevonden in Vapi`);
if (demoNumberInVapi.assistantId !== target.id) {
  await vapi("PATCH", `/phone-number/${demoNumberInVapi.id}`, { provider: demoNumberInVapi.provider, assistantId: target.id });
  console.log(`demonummer ${target.phone} -> ${config.type.toLowerCase()}-assistant`);
}

// ---------- check ----------
const after = await vapi("GET", `/assistant/${target.id}`);
const afterTools = await Promise.all(withHeader.map((t) => vapi("GET", `/tool/${t.id}`)));
const numberAfter = await vapi("GET", `/phone-number/${demoNumberInVapi.id}`);
const ok =
  numberAfter.assistantId === target.id &&
  after.model.messages[0].content === prompt &&
  after.server?.url === serverUrl &&
  afterTools.every((t) => t.headers.properties[headerOf(t)].value === config.businessId);
if (!ok) throw new Error("Controle na het aanpassen klopt niet; kijk in Vapi en de backup.");

console.log(`klaar: "${after.name}" staat op ${spoken} (${config.businessId}). Bel ${target.phone} om te testen.`);
