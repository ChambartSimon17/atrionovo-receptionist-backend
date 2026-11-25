import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { TtlCache } from "../src/modules/vapi/ttl-cache.js";
import { isAuthorizedVapiRequest } from "../src/modules/vapi/vapi-auth.js";
import {
  callReferences,
  callerNumberOf,
  resolveBusinessFromCall,
  clearBusinessCache,
} from "../src/modules/vapi/resolve-business.js";
import {
  callVariables,
  massageTypesText,
  openingDaysText,
} from "../src/modules/vapi/call-variables.js";
import { cleanKeyterms, transcriberFor } from "../src/modules/vapi/vapi-config.js";
import { parseArguments } from "../src/modules/vapi/vapi-tools.js";
import { TOOL_DEFINITIONS } from "../src/modules/vapi/tool-definitions.js";

const hours = (day, from, to) => ({
  dayOfWeek: day,
  opensAtMinutes: from * 60,
  closesAtMinutes: to * 60,
});

const BAAN_SABAI = {
  id: "biz_1",
  name: "Baan Sabai",
  businessType: "MASSAGE",
  timezone: "Europe/Brussels",
  voiceAgentEnabled: true,
  fallbackPhoneNumber: null,
  transcriberKeyterms: [],
  openingHours: [
    ...["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].map((d) => hours(d, 10, 22)),
    hours("SATURDAY", 10.5, 20),
  ],
  massageServiceNames: [
    "Traditionele Thaise Massage 60 min",
    "Traditionele Thaise Massage 90 min",
    "Thai Aromatherapy Massage",
    "Nek-, Schouder- en Rugmassage",
  ],
};

// ------------------------------------------------------
// Which business
// ------------------------------------------------------

test("callReferences: phone number id first, business_id for web calls", () => {
  assert.deepEqual(
    callReferences({ call: { phoneNumberId: "pn_1" } }),
    { phoneNumberId: "pn_1", businessId: null }
  );

  assert.deepEqual(
    callReferences({
      call: { assistantOverrides: { variableValues: { business_id: "biz_9" } } },
    }),
    { phoneNumberId: null, businessId: "biz_9" }
  );

  assert.deepEqual(
    callReferences({ call: { metadata: { businessId: "biz_8" } } }),
    { phoneNumberId: null, businessId: "biz_8" }
  );
});

test("callerNumberOf: from the call, never from tool arguments", () => {
  assert.equal(callerNumberOf({ call: { customer: { number: "+32470000000" } } }), "+32470000000");
  assert.equal(callerNumberOf({ call: {} }), null);
});

function fakeDb(rows) {
  const calls = [];
  return {
    calls,
    business: {
      async findUnique({ where }) {
        calls.push(where);
        const row = rows.find((r) =>
          where.vapiPhoneNumberId ? r.vapiPhoneNumberId === where.vapiPhoneNumberId : r.id === where.id
        );
        return row ? { ...row, massageServices: row.massageServices ?? [] } : null;
      },
    },
  };
}

test("resolveBusinessFromCall: by number, falls back to business_id, caches", async () => {
  clearBusinessCache();
  const db = fakeDb([
    { id: "biz_1", vapiPhoneNumberId: "pn_1", name: "A" },
    { id: "biz_2", vapiPhoneNumberId: null, name: "B" },
  ]);

  const byNumber = await resolveBusinessFromCall({ call: { phoneNumberId: "pn_1" } }, { db });
  assert.equal(byNumber.business.id, "biz_1");
  assert.equal(byNumber.via, "phoneNumberId");

  await resolveBusinessFromCall({ call: { phoneNumberId: "pn_1" } }, { db });
  assert.equal(db.calls.length, 1, "second lookup comes from the cache");

  const web = await resolveBusinessFromCall(
    { call: { assistantOverrides: { variableValues: { business_id: "biz_2" } } } },
    { db }
  );
  assert.equal(web.business.id, "biz_2");
  assert.equal(web.via, "businessId");

  const unknown = await resolveBusinessFromCall({ call: { phoneNumberId: "pn_x" } }, { db });
  assert.equal(unknown.business, null);
  clearBusinessCache();
});

// ------------------------------------------------------
// Auth
// ------------------------------------------------------

test("isAuthorizedVapiRequest", () => {
  const opts = { secret: "s3cret", nodeEnv: "production" };
  assert.equal(isAuthorizedVapiRequest({ "x-vapi-secret": "s3cret" }, opts), true);
  assert.equal(isAuthorizedVapiRequest({ authorization: "Bearer s3cret" }, opts), true);
  assert.equal(isAuthorizedVapiRequest({ "x-vapi-secret": "wrong" }, opts), false);
  assert.equal(isAuthorizedVapiRequest({}, opts), false);
  assert.equal(isAuthorizedVapiRequest({}, { secret: undefined, nodeEnv: "production" }), false);
  assert.equal(isAuthorizedVapiRequest({}, { secret: undefined, nodeEnv: "development" }), true);
});

// ------------------------------------------------------
// Variables and prompt
// ------------------------------------------------------

test("openingDaysText groups days like the demo scripts", () => {
  assert.equal(
    openingDaysText(BAAN_SABAI.openingHours),
    "maandag tot en met vrijdag, van 10 uur tot 22 uur; zaterdag, van 10 uur 30 tot 20 uur. Op de andere dagen is de zaak gesloten."
  );
});

test("massageTypesText drops durations and duplicates", () => {
  assert.equal(
    massageTypesText(BAAN_SABAI.massageServiceNames),
    "Traditionele Thaise Massage, Thai Aromatherapy Massage, Nek-, Schouder- en Rugmassage"
  );
});

test("the massage prompt filled with Baan Sabai equals the live Baan Sabai prompt", () => {
  const vars = callVariables({ ...BAAN_SABAI, massageServiceNames: [
    "Traditionele Thaise Massage", "Thai Aromatherapy Massage",
    "Baan Sabai Signature Thai Massage", "Nek-, Schouder- en Rugmassage",
  ] });

  const filled = readFileSync("vapi/prompts/massage.nl.md", "utf8")
    .replaceAll("{{zaak_naam}}", vars.zaak_naam)
    .replaceAll("{{openingsuren}}", vars.openingsuren)
    .replaceAll("{{massages}}", vars.massages);

  assert.match(filled, /Je bent Emiel, de AI-receptionist van Baan Sabai\./);
  assert.match(filled, /Openingsdagen: maandag tot en met vrijdag, van 10 uur tot 22 uur; zaterdag, van 10 uur 30 tot 20 uur\./);
  assert.match(filled, /Soorten massages: Traditionele Thaise Massage, Thai Aromatherapy Massage, Baan Sabai Signature Thai Massage, Nek-, Schouder- en Rugmassage\n/);
  assert.doesNotMatch(filled, /\{\{(zaak_naam|openingsuren|massages)\}\}/);
});

test("callVariables: no double full stop for names ending in a dot", () => {
  const vars = callVariables({ ...BAAN_SABAI, name: "VOL.", businessType: "RESTAURANT" });
  assert.equal(vars.zaak_naam, "VOL");
  assert.equal(vars.massages, undefined);
  assert.equal(vars.business_id, "biz_1");
});

// ------------------------------------------------------
// Keyterms
// ------------------------------------------------------

test("cleanKeyterms keeps one entry per term, trims, dedupes, limits", () => {
  assert.deepEqual(
    cleanKeyterms(["  In A Sense ", "Cindy", "cindy", "", "Nek-, Schouder- en Rugmassage"]),
    ["In A Sense", "Cindy", "Nek-, Schouder- en Rugmassage"]
  );
  assert.equal(cleanKeyterms(Array.from({ length: 300 }, (_, i) => `woord${i}`)).length, 100);
});

test("transcriberFor: full transcriber plus keyterms, or nothing", () => {
  assert.equal(transcriberFor([]), null);
  const t = transcriberFor(["Cindy", "Hasselt"]);
  assert.equal(t.provider, "deepgram");
  assert.equal(t.language, "nl-BE");
  assert.deepEqual(t.keyterm, ["Cindy", "Hasselt"]);
});

// ------------------------------------------------------
// Tools
// ------------------------------------------------------

test("no shared tool asks the LLM for a business id or phone number", () => {
  for (const [name, def] of Object.entries(TOOL_DEFINITIONS)) {
    const params = Object.keys(def.parameters.properties).map((p) => p.toLowerCase());
    for (const forbidden of ["businessid", "restaurantid", "business_id", "phonenumber"]) {
      assert.ok(!params.includes(forbidden), `${name} has ${forbidden}`);
    }
  }
});

test("parseArguments: object or JSON string, drops empty values", () => {
  assert.deepEqual(parseArguments({ date: "2026-11-24", time: "" }), { date: "2026-11-24" });
  assert.deepEqual(parseArguments('{"guestCount":2}'), { guestCount: 2 });
  assert.deepEqual(parseArguments(undefined), {});
});

test("TtlCache expires entries but keeps a stale copy", () => {
  let now = 0;
  const cache = new TtlCache({ ttlMs: 1000, now: () => now });
  cache.set("a", 1);
  assert.equal(cache.get("a"), 1);
  now = 1500;
  assert.equal(cache.getStale("a"), 1);
  assert.equal(cache.get("a"), undefined);
});
