// Shows or sets the Vapi fields of one business:
//   - vapiPhoneNumberId     which Vapi number belongs to it
//   - fallbackPhoneNumber   where calls go when our backend fails
//   - transcriberKeyterms   words the transcriber must recognise
//
// Usage:
//   npm run vapi:business -- <slug>                       show
//   npm run vapi:business -- <slug> --number=<vapi phone number id>
//   npm run vapi:business -- <slug> --fallback=+3211223344
//   npm run vapi:business -- <slug> --keyterms "In A Sense" "Cindy" "Hasselt"
//   npm run vapi:business -- <slug> --add-keyterms "Lanaken"
//   npm run vapi:business -- <slug> --keyterms-file=keyterms.txt   (one per line)
//   npm run vapi:business -- <slug> --no-number | --no-fallback | --no-keyterms
//
// A number belongs to one business. --number takes it away from the
// business that had it (handy for demos: one demo number, moved to the
// next prospect). After --number/--fallback, run
//   npm run vapi:sync -- --numbers --only=<vapi phone number id>
// so the number in Vapi points to /vapi/assistant-request.
//
// Live customers (vapi/customers.json) are refused, unless named on
// purpose with --customer=<businessId>.
//
// Option --db-env=<file> (default .env.render = production database).
// The backend caches a business for VAPI_BUSINESS_CACHE_SECONDS (2 min).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT as ROOT, cleanKeyterms } from "../../src/modules/vapi/vapi-config.js";
import { refuseCustomer } from "./customers.mjs";

const args = process.argv.slice(2);
const slug = args[0];
if (!slug || slug.startsWith("--")) throw new Error("Geef de slug van de zaak mee, bv. npm run vapi:business -- baansabai");

const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const flag = (name) => args.includes(`--${name}`);

// Words after --keyterms / --add-keyterms, up to the next --option.
function listAfter(name) {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return null;
  const rest = args.slice(i + 1);
  const end = rest.findIndex((a) => a.startsWith("--"));
  return end < 0 ? rest : rest.slice(0, end);
}

const dotenv = await import("dotenv");
const dbEnv = option("db-env") ?? ".env.render";
const { DATABASE_URL } = dotenv.parse(readFileSync(join(ROOT, dbEnv)));
if (!DATABASE_URL) throw new Error(`Geen DATABASE_URL in ${dbEnv}`);

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ datasourceUrl: DATABASE_URL });

const SELECT = { id: true, name: true, slug: true, businessType: true, vapiPhoneNumberId: true, fallbackPhoneNumber: true, transcriberKeyterms: true };

try {
  const business = await prisma.business.findUnique({ where: { slug }, select: SELECT });
  if (!business) throw new Error(`Geen zaak met slug "${slug}" in ${dbEnv}`);

  const data = {};

  // Live customers (vapi/customers.json): never by accident.
  const allowed = option("customer") ?? null;
  const changing = ["number", "fallback", "keyterms-file"].some(option) || ["no-number", "no-fallback", "no-keyterms", "keyterms", "add-keyterms"].some(flag);
  if (changing) refuseCustomer(business.id, `${business.name}`, allowed);

  const number = option("number");
  if (number) {
    refuseCustomer(number, `Nummer ${number}`, allowed);
    data.vapiPhoneNumberId = number;
  }
  if (flag("no-number")) data.vapiPhoneNumberId = null;

  const fallback = option("fallback");
  if (fallback) {
    const normalized = fallback.replace(/[\s()./-]/g, "");
    if (!/^\+\d{8,15}$/.test(normalized)) throw new Error(`--fallback moet een nummer in internationaal formaat zijn, bv. +3211223344 (kreeg ${fallback})`);
    data.fallbackPhoneNumber = normalized;
  }
  if (flag("no-fallback")) data.fallbackPhoneNumber = null;

  const file = option("keyterms-file");
  const replace = listAfter("keyterms") ?? (file ? readFileSync(file, "utf8").split("\n") : null);
  const add = listAfter("add-keyterms");
  if (replace) data.transcriberKeyterms = cleanKeyterms(replace);
  if (add) data.transcriberKeyterms = cleanKeyterms([...business.transcriberKeyterms, ...add]);
  if (flag("no-keyterms")) data.transcriberKeyterms = [];

  let result = business;

  if (Object.keys(data).length) {
    result = await prisma.$transaction(async (tx) => {
      if (data.vapiPhoneNumberId) {
        const holder = await tx.business.findUnique({ where: { vapiPhoneNumberId: data.vapiPhoneNumberId }, select: { id: true, slug: true } });
        if (holder && holder.id !== business.id) {
          await tx.business.update({ where: { id: holder.id }, data: { vapiPhoneNumberId: null } });
          console.log(`nummer weggenomen bij ${holder.slug}`);
        }
      }
      return tx.business.update({ where: { id: business.id }, data, select: SELECT });
    });
    console.log("bijgewerkt.");
  }

  console.log(`
${result.name} (${result.slug}, ${result.businessType}, ${result.id})
  vapiPhoneNumberId:   ${result.vapiPhoneNumberId ?? "-"}
  fallbackPhoneNumber: ${result.fallbackPhoneNumber ?? "-"}
  keyterms (${result.transcriberKeyterms.length}): ${result.transcriberKeyterms.join(" | ") || "-"}`);

  if (data.vapiPhoneNumberId || "fallbackPhoneNumber" in data) {
    console.log(`\nVergeet niet: npm run vapi:sync -- --numbers --only=${result.vapiPhoneNumberId ?? "<id>"}`);
  }
} finally {
  await prisma.$disconnect();
}
