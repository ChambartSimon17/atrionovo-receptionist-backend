// Puts the multi-tenant Vapi setup from git into Vapi:
//   1. the shared function tools  (src/modules/vapi/tool-definitions.js)
//      -> server URL /vapi/tools, secret header, timeout
//   2. the template assistants    (vapi/config.json + vapi/prompts/*.md)
//      -> prompt, toolIds, voice, transcriber, call-events URL
//   3. with --numbers: the Vapi numbers of the businesses in the
//      database -> server URL /vapi/assistant-request, timeout,
//      fallbackDestination, no fixed assistant
//
// Usage:
//   npm run vapi:sync -- --dry-run                 show what would change
//   npm run vapi:sync                              tools + assistants
//   npm run vapi:sync -- --numbers                 + every number in the DB
//   npm run vapi:sync -- --numbers --only=<id>     + one Vapi number
//
// Options:
//   --backend=<url>    backend URL (default vapi/config.json backendUrl)
//   --db-env=<file>    env file with the DATABASE_URL to read the numbers
//                      from (default .env.render = production)
//
// Needs in .env: VAPI_API_KEY, VAPI_SERVER_SECRET (the same secret as on
// Render). Everything is backed up to vapi/backups/ before it changes.
// The created ids are kept in vapi/ids.json (commit that file).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT as ROOT } from "../../src/modules/vapi/vapi-config.js";
import { TOOL_DEFINITIONS, TOOL_DELAYED_MESSAGE } from "../../src/modules/vapi/tool-definitions.js";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;

const dryRun = flag("dry-run");
const withNumbers = flag("numbers");
const onlyNumber = option("only");

const dotenv = await import("dotenv");
dotenv.config({ path: join(ROOT, ".env"), quiet: true });

const config = JSON.parse(readFileSync(join(ROOT, "vapi/config.json"), "utf8"));
const backend = option("backend", process.env.VAPI_BACKEND_URL ?? config.backendUrl).replace(/\/$/, "");
const KEY = process.env.VAPI_API_KEY;
const SECRET = process.env.VAPI_SERVER_SECRET;

if (!KEY) throw new Error("VAPI_API_KEY ontbreekt in .env");
if (!SECRET) throw new Error("VAPI_SERVER_SECRET ontbreekt in .env (zelfde waarde als op Render)");

const IDS_FILE = join(ROOT, "vapi/ids.json");
const ids = existsSync(IDS_FILE) ? JSON.parse(readFileSync(IDS_FILE, "utf8")) : { tools: {}, assistants: {} };

const BACKUPS = join(ROOT, "vapi/backups");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = {};

// ---------- Vapi API ----------
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

async function getOrNull(path) {
  try {
    return await vapi("GET", path);
  } catch (error) {
    if (/-> 404/.test(error.message)) return null;
    throw error;
  }
}

const serverFor = (url, timeoutSeconds) => ({
  url,
  timeoutSeconds,
  headers: { "x-vapi-secret": SECRET },
});

// Compare only the fields we set, so an unchanged object is not PATCHed.
function differs(current, wanted) {
  if (wanted === null || typeof wanted !== "object") return current !== wanted;
  if (Array.isArray(wanted)) {
    return !Array.isArray(current) || current.length !== wanted.length || wanted.some((w, i) => differs(current[i], w));
  }
  if (!current || typeof current !== "object") return true;
  return Object.entries(wanted).some(([key, value]) => differs(current[key], value));
}

const changes = [];
async function upsert(kind, label, { current, wanted, create, patch }) {
  if (!current) {
    changes.push(`${kind} ${label}: aanmaken`);
    if (dryRun) return null;
    return create();
  }
  backup[`${kind}:${current.id}`] = current;
  if (!differs(current, wanted)) {
    console.log(`  = ${kind} ${label} ongewijzigd`);
    return current;
  }
  changes.push(`${kind} ${label}: bijwerken`);
  if (dryRun) return current;
  return patch();
}

// ---------- 1. tools ----------
console.log(`Backend: ${backend}${dryRun ? "  (dry run)" : ""}`);
console.log("\n1. Tools");

const toolsUrl = `${backend}/vapi/tools`;

for (const [name, definition] of Object.entries(TOOL_DEFINITIONS)) {
  const wanted = {
    function: { name, description: definition.description, parameters: definition.parameters },
    server: serverFor(toolsUrl, config.timeouts.toolSeconds),
    messages: [TOOL_DELAYED_MESSAGE],
  };

  const current = ids.tools[name] ? await getOrNull(`/tool/${ids.tools[name]}`) : null;
  if (current && current.type !== "function") throw new Error(`vapi/ids.json: tool ${name} is geen function-tool`);

  const tool = await upsert("tool", name, {
    current,
    wanted,
    create: () => vapi("POST", "/tool", { type: "function", ...wanted }),
    patch: () => vapi("PATCH", `/tool/${current.id}`, wanted),
  });

  if (tool) ids.tools[name] = tool.id;
}

// ---------- 2. assistants ----------
console.log("\n2. Sjabloon-assistants");

const envLines = [];

for (const [type, assistantConfig] of Object.entries(config.assistants)) {
  const prompt = readFileSync(join(ROOT, assistantConfig.prompt), "utf8");
  const toolIds = [
    ...assistantConfig.tools.map((name) => ids.tools[name] ?? `<nieuw:${name}>`),
    ...Object.entries(assistantConfig.existingToolIds).filter(([k]) => !k.startsWith("_")).map(([, id]) => id),
  ];

  const { model, ...defaults } = config.assistantDefaults;
  const wanted = {
    name: assistantConfig.name,
    ...defaults,
    model: { ...model, toolIds, messages: [{ role: "system", content: prompt }] },
    server: serverFor(`${backend}/assistant/call-events`, config.timeouts.callEventsSeconds),
  };

  const id = ids.assistants[type] ?? process.env[assistantConfig.envVar];
  const current = id ? await getOrNull(`/assistant/${id}`) : null;

  const assistant = await upsert("assistant", `${type} "${assistantConfig.name}"`, {
    current,
    wanted,
    create: () => vapi("POST", "/assistant", wanted),
    patch: () => vapi("PATCH", `/assistant/${current.id}`, wanted),
  });

  if (assistant) {
    ids.assistants[type] = assistant.id;
    envLines.push(`${assistantConfig.envVar}=${assistant.id}`);
  }
}

// ---------- 3. numbers ----------
if (withNumbers) {
  console.log("\n3. Telefoonnummers");

  const dbEnv = option("db-env", ".env.render");
  const db = dotenv.parse(readFileSync(join(ROOT, dbEnv)));
  if (!db.DATABASE_URL) throw new Error(`Geen DATABASE_URL in ${dbEnv}`);
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: db.DATABASE_URL });

  const businesses = await prisma.business.findMany({
    where: { vapiPhoneNumberId: onlyNumber ? onlyNumber : { not: null } },
    select: { id: true, name: true, vapiPhoneNumberId: true, fallbackPhoneNumber: true },
  });
  await prisma.$disconnect();

  if (onlyNumber && !businesses.length) {
    throw new Error(`Geen zaak met vapiPhoneNumberId ${onlyNumber} in ${dbEnv}. Koppel eerst: npm run vapi:business`);
  }

  for (const business of businesses) {
    const current = await vapi("GET", `/phone-number/${business.vapiPhoneNumberId}`);
    const wanted = {
      // No fixed assistant: Vapi asks /vapi/assistant-request.
      assistantId: null,
      squadId: null,
      workflowId: null,
      server: serverFor(`${backend}/vapi/assistant-request`, config.timeouts.assistantRequestSeconds),
      ...(business.fallbackPhoneNumber && {
        fallbackDestination: { type: "number", number: business.fallbackPhoneNumber },
      }),
    };

    const label = `${current.number ?? business.vapiPhoneNumberId} (${business.name})`;
    if (!business.fallbackPhoneNumber) console.log(`  ! ${label}: geen fallbackPhoneNumber, de oproep wordt bij een fout opgehangen`);

    // The PATCH body for a number needs its provider.
    const patchBody = { provider: current.provider, ...wanted };
    for (const key of ["assistantId", "squadId", "workflowId"]) {
      if (current[key] == null) delete patchBody[key];
    }

    await upsert("nummer", label, {
      current: { ...current, assistantId: current.assistantId ?? null, squadId: current.squadId ?? null, workflowId: current.workflowId ?? null },
      wanted,
      create: () => { throw new Error("nummers maakt dit script niet aan"); },
      patch: () => vapi("PATCH", `/phone-number/${current.id}`, patchBody),
    });
  }
}

// ---------- report ----------
if (Object.keys(backup).length) {
  mkdirSync(BACKUPS, { recursive: true });
  const file = join(BACKUPS, `${stamp}.json`);
  writeFileSync(file, JSON.stringify(backup, null, 2));
  console.log(`\nbackup: ${file}`);
}

console.log(changes.length ? `\nWijzigingen${dryRun ? " (niet uitgevoerd)" : ""}:\n  - ${changes.join("\n  - ")}` : "\nAlles stond al goed.");

if (!dryRun) {
  writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2) + "\n");
  console.log(`ids: ${IDS_FILE}`);
  if (envLines.length) console.log(`\nZet op Render (Environment):\n  ${envLines.join("\n  ")}`);
}
