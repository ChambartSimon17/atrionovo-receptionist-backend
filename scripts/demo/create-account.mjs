// Creates the demo account from a config and draws its floor plan.
// Usage: node scripts/demo/create-account.mjs scripts/demo/demos/<slug>.json
//
// - registers the business (massage or restaurant) on the
//   production backend; the password goes to
//   demo-logins.local.txt, never to the console
// - opening hours, settings
// - massage: services, treatment rooms, therapists
// - floor plan (floor-plan.mjs)
// - writes the business id back into the config
import { randomBytes } from "node:crypto";
import { call, loadConfig, saveConfig, openingRows, serviceRows, rememberLogin, login } from "./lib.mjs";
import { drawFloorPlan } from "./floor-plan.mjs";

const config = loadConfig(process.argv[2]);

if (config.businessId) {
  throw new Error(`Dit account bestaat al (${config.businessId}). Verwijder businessId uit de config om opnieuw te beginnen.`);
}

const password = `${config.slug.slice(0, 4)}-${randomBytes(5).toString("hex")}`;
const reg = await call("POST", "/auth/register", {
  businessName: config.name,
  slug: config.slug,
  countryCode: config.countryCode ?? "BE",
  businessType: config.type,
  firstName: config.owner?.firstName ?? "Demo",
  lastName: config.owner?.lastName ?? config.name,
  email: config.email,
  password,
});
rememberLogin(`${config.name} (${config.type.toLowerCase()}, demo)`, config.email, password);

const B = reg.business.id;
config.businessId = B;
config.slug = reg.business.slug;
saveConfig(config);
console.log("account:", config.name, "| business id:", B, "| slug:", config.slug, "| login:", config.email);

const { token } = await login(config);

await call("PUT", "/businesses/me", {
  timezone: "Europe/Brussels",
  language: config.language ?? "nl",
  ...(config.type === "MASSAGE" ? { appointmentBufferMinutes: config.bufferMinutes ?? 15 } : { maxCapacity: config.maxCapacity ?? 60 }),
}, token);

const hours = openingRows(config);
await call("PUT", `/businesses/${B}/opening-hours`, { openingHours: hours }, token);
console.log("openingsuren:", hours.length, "blokken");

if (config.type === "MASSAGE") {
  const ids = [];
  for (const s of serviceRows(config)) {
    const created = await call("POST", `/businesses/${B}/massage-services`, {
      name: s.name, description: s.description, durationMinutes: s.durationMinutes, priceCents: s.priceCents,
    }, token);
    ids.push(created.id ?? created.service?.id ?? created.massageService?.id);
  }
  console.log("massages:", ids.length);

  for (const name of config.rooms ?? ["Behandelruimte"]) {
    await call("POST", `/businesses/${B}/treatment-rooms`, { name, serviceIds: ids }, token);
  }
  const workingHours = hours.map((h) => ({ dayOfWeek: h.dayOfWeek, startMinutes: h.opensAtMinutes, endMinutes: h.closesAtMinutes }));
  for (const name of config.therapists ?? [config.owner?.firstName ?? "Therapeut"]) {
    await call("POST", `/businesses/${B}/therapists`, { name, serviceIds: ids, workingHours }, token);
  }
  console.log("kamers:", (config.rooms ?? ["Behandelruimte"]).length, "| therapeuten:", (config.therapists ?? [1]).length);
}

await drawFloorPlan(config);
console.log("klaar");
