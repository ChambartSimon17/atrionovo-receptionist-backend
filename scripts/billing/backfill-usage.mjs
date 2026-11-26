// Fills the usage report with what happened before metering existed:
//
//   1. one UsageRecord per stored call (CallLog), with its duration
//   2. one UsageRecord per confirmation SMS already sent (smsSentAt)
//   3. the real cost of those calls, fetched from Vapi (--costs)
//   4. the demo accounts (scripts/demo/demos/*.json) marked isDemo,
//      never the live customers of vapi/customers.json
//
// Safe to run again: a call or SMS already counted is skipped.
// Nothing is written without --apply.
//
// Usage:
//   node scripts/billing/backfill-usage.mjs                       (local .env, dry run)
//   node scripts/billing/backfill-usage.mjs --apply --costs
//   node scripts/billing/backfill-usage.mjs --db-env=.env.render --apply --costs   (production)
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const flag = (name) => args.includes(`--${name}`);

const dbEnv = option("db-env") ?? ".env";
const apply = flag("apply");
const withCosts = flag("costs");

const fileEnv = dotenv.parse(readFileSync(join(ROOT, dbEnv)));
const localEnv = dotenv.parse(readFileSync(join(ROOT, ".env")));
if (!fileEnv.DATABASE_URL) throw new Error(`Geen DATABASE_URL in ${dbEnv}`);
const vapiKey = fileEnv.VAPI_API_KEY ?? localEnv.VAPI_API_KEY;

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ datasourceUrl: fileEnv.DATABASE_URL });

console.log(`Database uit ${dbEnv}${apply ? "" : " (dry run: voeg --apply toe om te schrijven)"}\n`);

// 1 + 2: calls and SMS
const counted = new Set(
  (await prisma.usageRecord.findMany({ select: { externalId: true } })).map((record) => record.externalId)
);

// Temporary callback ids are not Vapi calls.
const calls = (await prisma.callLog.findMany({
  select: { id: true, businessId: true, externalId: true, startedAt: true, durationSeconds: true, smsSentAt: true },
})).filter((call) => !call.externalId.startsWith("callback-"));

const newCalls = calls.filter((call) => !counted.has(call.externalId));
const newSms = calls.filter((call) => call.smsSentAt && !counted.has(`call-sms:${call.id}`));

console.log(`Gesprekken: ${calls.length} in CallLog, ${newCalls.length} nog niet geteld`);
console.log(`Sms: ${newSms.length} verstuurde bevestigingen nog niet geteld (kost wordt geschat)`);

if (apply) {
  for (const call of newCalls) {
    await prisma.usageRecord.create({
      data: {
        businessId: call.businessId,
        kind: "CALL",
        source: "RECEPTIONIST",
        externalId: call.externalId,
        occurredAt: call.startedAt,
        quantity: call.durationSeconds,
      },
    });
  }

  for (const call of newSms) {
    await prisma.usageRecord.create({
      data: {
        businessId: call.businessId,
        kind: "SMS",
        source: "CALL_SMS",
        externalId: `call-sms:${call.id}`,
        occurredAt: call.smsSentAt,
        quantity: 1,
      },
    });
  }
}

// 3: Vapi costs
if (withCosts) {
  if (!vapiKey) {
    console.log("\nGeen VAPI_API_KEY: kosten niet opgehaald.");
  } else {
    const open = await prisma.usageRecord.findMany({
      where: { kind: "CALL", costAmount: null },
      select: { id: true, externalId: true },
    });

    console.log(`\nKosten ophalen bij Vapi voor ${open.length} gesprekken...`);
    let found = 0;

    for (const record of open) {
      const response = await fetch(`https://api.vapi.ai/call/${encodeURIComponent(record.externalId)}`, {
        headers: { Authorization: `Bearer ${vapiKey}` },
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);

      const call = response?.ok ? await response.json() : null;
      const cost = Number(call?.cost);

      if (Number.isFinite(cost) && cost > 0) {
        found += 1;

        if (apply) {
          await prisma.usageRecord.update({
            where: { id: record.id },
            data: { costAmount: cost, costCurrency: "USD", costBreakdown: call.costBreakdown ?? undefined },
          });
        }
      }

      // Vapi's API allows a few requests a second.
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    console.log(`${found} van ${open.length} kosten gevonden${apply ? " en opgeslagen" : ""}`);
  }
}

// 4: demo accounts
const customers = JSON.parse(readFileSync(join(ROOT, "vapi/customers.json"), "utf8")).customers.map((c) => c.businessId);
const demoSlugs = readdirSync(join(ROOT, "scripts/demo/demos"))
  .filter((file) => file.endsWith(".json"))
  .map((file) => JSON.parse(readFileSync(join(ROOT, "scripts/demo/demos", file), "utf8")).slug ?? file.replace(/\.json$/, ""));

const demos = await prisma.business.findMany({
  where: { slug: { in: demoSlugs }, id: { notIn: customers }, isDemo: false },
  select: { id: true, name: true, slug: true },
});

console.log(`\nDemo-accounts te markeren: ${demos.map((d) => d.slug).join(", ") || "geen"}`);

if (apply && demos.length > 0) {
  await prisma.business.updateMany({ where: { id: { in: demos.map((d) => d.id) } }, data: { isDemo: true } });
}

await prisma.$disconnect();
console.log("\nKlaar.");
