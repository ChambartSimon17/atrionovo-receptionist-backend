// Fills a demo account with a realistic agenda, so the app,
// the dashboard and the analytics look lived-in:
// ~15 weeks of history (growing), the coming three weeks
// (thinning out), customers with regulars, payments (massage)
// and AI call logs with transcripts.
//
// Usage: node scripts/demo/seed.mjs scripts/demo/demos/<slug>.json
//
// Safe to run again: it first removes the agenda, customers,
// payments and demo calls of THIS demo account (it keeps
// bookings on the name "Test Demo"). Only for demo accounts.
import { randomBytes } from "node:crypto";
import { loadConfig, prisma, todayLocal, addDays, dayName, local, toMinutes, hhmm, random, seedFrom } from "./lib.mjs";

const config = loadConfig(process.argv[2]);
if (!config.businessId) throw new Error("Maak eerst het account aan (create-account.mjs).");

const p = await prisma();
const B = config.businessId;
const biz = await p.business.findUnique({ where: { id: B } });
if (!biz || biz.slug !== config.slug) throw new Error(`Business ${B} hoort niet bij slug ${config.slug}.`);

const { rnd, pick, chance, weighted } = random(seedFrom(config.slug));
const TODAY = todayLocal();
const FIRST = addDays(TODAY, -105);
const LAST = addDays(TODAY, 20);
const PREFIX = `demo-${config.slug}-`;
const SPOKEN = config.spokenName ?? config.name;

// Rows are collected first and written in large batches:
// one request per row is far too slow against Render.
const rows = { customer: [], appointment: [], payment: [], reservation: [], reservationTable: [], callLog: [] };
const newId = () => `c${randomBytes(12).toString("hex")}`;
const add = (model, data) => { const id = data.id ?? newId(); rows[model].push({ id, ...data }); return { id }; };
async function flush() {
  for (const model of ["customer", "appointment", "payment", "reservation", "reservationTable", "callLog"]) {
    for (let i = 0; i < rows[model].length; i += 500) {
      await p[model].createMany({ data: rows[model].slice(i, i + 500).map(({ id, ...r }) => (model === "reservationTable" ? r : { id, ...r })) });
    }
  }
}

// ---------- clean earlier data ----------
const isTest = { firstName: "Test", lastName: "Demo" };
if (config.type === "MASSAGE") {
  const keep = await p.appointment.findMany({ where: { businessId: B, ...isTest }, select: { id: true, customerId: true } });
  await p.payment.deleteMany({ where: { businessId: B, appointmentId: { notIn: keep.map((a) => a.id) } } });
  await p.appointment.deleteMany({ where: { businessId: B, id: { notIn: keep.map((a) => a.id) } } });
  await p.customer.deleteMany({ where: { businessId: B, id: { notIn: keep.map((a) => a.customerId).filter(Boolean) } } });
} else {
  const keep = await p.reservation.findMany({ where: { businessId: B, ...isTest }, select: { id: true, customerId: true } });
  await p.reservation.deleteMany({ where: { businessId: B, id: { notIn: keep.map((r) => r.id) } } });
  await p.customer.deleteMany({ where: { businessId: B, id: { notIn: keep.map((r) => r.customerId).filter(Boolean) } } });
}
await p.callLog.deleteMany({ where: { businessId: B, externalId: { startsWith: PREFIX } } });

// ---------- people ----------
const FIRSTS = ["Lotte","Sarah","Eline","Hanne","Lien","Marie","Julie","Laura","Femke","Charlotte","Nathalie","Ellen","Sofie","Annelies","Katrien","Inge","Leen","Evelien","Jana","Emma","Noor","Astrid","Kato","Elise","Sanne","Tine","Griet","Ilse","Veerle","An","Nina","Fleur","Jolien","Silke","Margot","Lisa","Thomas","Pieter","Jeroen","Wouter","Tom","Bram","Stijn","Koen","Joris","Dries","Kevin","Nick","Glenn","Bart","Ruben","Arne","Jens","Maarten","Yannick","Michiel","Wim","Lucas","Robbe","Seppe"];
const LASTS = ["Peeters","Janssens","Maes","Jacobs","Mertens","Willems","Claes","Goossens","Wouters","De Smet","Dubois","Lambert","Dupont","Van den Broeck","Hermans","Vermeulen","Van Damme","Verstraete","Smets","Aerts","Van Dyck","De Backer","Pauwels","Coppens","Martens","Leclercq","Vos","Desmet","Bogaert","Thys","Michiels","De Wilde","Van Gucht","Nijs","Schepers","Van Hove","Segers","Cools","Verhoeven","Op de Beeck"];
const usedPhones = new Set(), usedNames = new Set();
const phone = () => { let n; do { n = `+324${pick(["70","71","72","73","75","76","77","78","79","84","85","86","87","88","91","92","93","94","95","96","97","98"])}${String(Math.floor(rnd() * 1e6)).padStart(6, "0")}`; } while (usedPhones.has(n)); usedPhones.add(n); return n; };
function person(since) {
  let f, l; do { f = pick(FIRSTS); l = pick(LASTS); } while (usedNames.has(f + l)); usedNames.add(f + l);
  return { firstName: f, lastName: l, phoneNumber: phone(), since, email: chance(0.45) ? `${f}.${l}`.toLowerCase().replace(/[^a-z.]/g, "") + pick(["@gmail.com", "@hotmail.com", "@telenet.be", "@outlook.com"]) : null };
}

const dutch = (day) => new Intl.DateTimeFormat("nl-BE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
const windowsOf = (day) => (config.openingHours[dayName(day)] ?? []).map(([a, b]) => [toMinutes(a), toMinutes(b)]);
const monthFactor = (day) => { const age = (new Date(`${TODAY}T12:00:00Z`) - new Date(`${day}T12:00:00Z`)) / 864e5; return age > 75 ? 0.6 : age > 45 ? 0.75 : age > 15 ? 0.9 : 1; };
const aheadFactor = (day) => { if (day <= TODAY) return 1; const ahead = (new Date(`${day}T12:00:00Z`) - new Date(`${TODAY}T12:00:00Z`)) / 864e5; return ahead <= 7 ? 0.85 : ahead <= 14 ? 0.5 : 0.22; };
const VACATION = new Set(Array.from({ length: 7 }, (_, i) => addDays(TODAY, -84 + i)));

function bookedAtFor(day, startMinute) {
  const lead = Math.floor(rnd() * rnd() * 16);
  let bookedDay = addDays(day, -lead);
  if (bookedDay >= TODAY) bookedDay = addDays(TODAY, -1 - Math.floor(rnd() * 10));
  const minute = bookedDay === day ? Math.max(480, startMinute - 60 - Math.floor(rnd() * 120)) : 480 + Math.floor(rnd() * 780);
  return local(bookedDay, minute);
}

const people = [];
const created = [];
const sourceWeights = (day) => [["AI", day < addDays(TODAY, -60) ? 20 : 40], ["WEB", day < addDays(TODAY, -45) ? 15 : 25], ["APP", 35]];

// =================== MASSAGE ===================
if (config.type === "MASSAGE") {
  const services = await p.massageService.findMany({ where: { businessId: B } });
  const therapists = await p.therapist.findMany({ where: { businessId: B } });
  const rooms = await p.treatmentRoom.findMany({ where: { businessId: B } });
  const lanes = Math.max(1, Math.min(therapists.length, rooms.length));
  const buffer = biz.appointmentBufferMinutes ?? 0;
  // Popular: shorter and mid-length; long ones less often.
  const svcWeights = services.map((s) => [s, s.durationMinutes <= 60 ? 34 : s.durationMinutes <= 90 ? 30 : 16]);

  for (let i = 0; i < 12 + lanes * 4; i++) people.push({ ...person(addDays(FIRST, Math.floor(rnd() * 60))), regular: true, every: 14 + Math.floor(rnd() * 22), pref: weighted(svcWeights), next: null });
  for (let i = 0; i < 20 + lanes * 8; i++) people.push(person(addDays(FIRST, Math.floor(rnd() * 95))));
  people[3].vip = true; people[3].note = "Vaste klant. Graag iets meer druk op de schouders.";
  people[people.length - 4].flaky = true;

  const NOTES = ["Last van de onderrug", "Spanning in nek en schouders", "Zwanger, 22 weken", "Eerste keer, wat zenuwachtig", "Graag geen druk op de linkerknie", "Na een burn-out, graag rustig opbouwen", "Hoofdpijn sinds een week", "Cadeaubon gekregen", "Allergisch voor notenolie", "Sport veel, stijve kuiten"];

  for (let day = FIRST; day <= LAST; day = addDays(day, 1)) {
    const windows = windowsOf(day);
    if (!windows.length || VACATION.has(day)) continue;
    const open = windows.reduce((t, [a, b]) => t + b - a, 0);
    const perLane = (open / 540) * (3.2 + (dayName(day) === "SATURDAY" ? 1 : dayName(day) === "FRIDAY" ? 0.4 : 0) + (rnd() - 0.5) * 1.6);
    const n = Math.max(0, Math.round(perLane * lanes * monthFactor(day) * aheadFactor(day)));
    const lane = Array.from({ length: lanes }, () => []);
    const today = [];
    for (let tries = 0; today.length < n && tries < 80; tries++) {
      const due = people.filter((x) => x.regular && x.since <= day && (!x.next || x.next <= day) && !today.some((a) => a.who === x));
      let who;
      if (due.length && chance(0.55)) who = pick(due);
      else {
        const pool = people.filter((x) => !x.regular && x.since <= day && !today.some((a) => a.who === x));
        if (chance(0.3) || pool.length < 6) { who = person(day); people.push(who); } else who = pick(pool);
      }
      const service = who.pref && chance(0.75) ? who.pref : weighted(svcWeights);
      const [from, to] = weighted(windows.map((w) => [w, w[1] - w[0]]));
      const dur = service.durationMinutes;
      const latest = to - dur;
      if (latest < from) continue;
      const start = from + Math.floor((rnd() * (latest - from + 1)) / 15) * 15;
      const li = lane.findIndex((l) => l.every(([s, e]) => start >= e + buffer || start + dur + buffer <= s));
      if (li < 0) continue;
      lane[li].push([start, start + dur]);
      today.push({ who, service, start, li });
      if (who.regular) who.next = addDays(day, who.every + Math.floor(rnd() * 6) - 2);
    }
    for (const a of today) {
      const past = day < TODAY;
      let status = past ? weighted([["COMPLETED", 89], ["CANCELLED", 7], ["NO_SHOW", 3]]) : chance(0.05) ? "CANCELLED" : "CONFIRMED";
      if (a.who.flaky && past && chance(0.5)) status = "NO_SHOW";
      created.push({ ...a, day, status, source: weighted(sourceWeights(day)), bookedAt: bookedAtFor(day, a.start),
        notes: a.who.note && chance(0.3) ? a.who.note : chance(0.12) ? pick(NOTES) : null });
    }
  }

  const customers = writeCustomers();
  let calls = 0, pays = 0;
  for (const [i, c] of created.entries()) {
    const startTime = local(c.day, c.start);
    const endTime = new Date(startTime.getTime() + c.service.durationMinutes * 60000);
    const appt = add("appointment", {
      businessId: B, customerId: customers.get(c.who.phoneNumber),
      firstName: c.who.firstName, lastName: c.who.lastName, phoneNumber: c.who.phoneNumber, email: c.who.email,
      massageServiceId: c.service.id, serviceName: c.service.name, durationMinutes: c.service.durationMinutes, priceCents: c.service.priceCents,
      therapistId: therapists[c.li].id, roomId: rooms[c.li].id, startTime, endTime, status: c.status, source: c.source, notes: c.notes,
      createdAt: c.bookedAt, updatedAt: c.status === "CONFIRMED" ? c.bookedAt : endTime,
    });
    if (c.status === "COMPLETED") {
      add("payment", {
        businessId: B, appointmentId: appt.id, method: weighted([["CARD_TERMINAL", 62], ["CASH", 38]]), status: "PAID",
        items: [{ name: c.service.name, amountCents: c.service.priceCents }],
        amountCents: c.service.priceCents, tipCents: chance(0.18) ? pick([500, 500, 1000, 2000]) : 0,
        paidAt: new Date(endTime.getTime() + 5 * 60000), createdAt: new Date(endTime.getTime() + 4 * 60000),
      });
      pays++;
    }
    if (c.source === "AI") {
      const what = c.service.name.replace(/ \d+ min$/, "");
      bookingCall(i, c, `Nieuwe afspraak: ${what} op ${dutch(c.day)} om ${hhmm(c.start)}.` + (c.notes ? ` Opmerking: ${c.notes.toLowerCase()}.` : ""),
        `User: Ik zou graag een massage boeken.\nAI: Graag. Welke massage wilt u boeken?\nUser: De ${what.toLowerCase()}.\nAI: Voor welke dag?\nUser: ${dutch(c.day)}.\nAI: En hoe laat zou u willen komen?\nUser: Rond ${hhmm(c.start)}.\nAI: Een momentje, ik kijk het even na. Om ${hhmm(c.start)} is er nog plaats. Op welke naam mag ik de afspraak zetten?\nUser: ${c.who.firstName} ${c.who.lastName}.\nAI: Perfect. Ik heb een ${what.toLowerCase()} voor u genoteerd op ${dutch(c.day)} om ${hhmm(c.start)}. Mag ik de afspraak vastleggen?\nUser: Ja, graag.\nAI: Perfect, uw afspraak is bevestigd. U ontvangt binnenkort een bevestiging per sms.`);
      calls++;
    }
  }
  calls += await otherCalls([
    ["INFORMATION", `Vraag naar het adres en parkeren.${config.address ? ` Adres gegeven: ${config.address}.` : ""}`, "Waar zijn jullie precies gelegen?"],
    ["INFORMATION", "Vraag welke massages er zijn. Het aanbod kort overlopen.", "Welke massages doen jullie allemaal?"],
    ["INFORMATION", "Vraag naar de prijs van een massage. Prijs gegeven.", "Wat kost een massage bij jullie?"],
    ["NEEDS_CALLBACK", "Wil een cadeaubon kopen. Graag terugbellen.", "Verkopen jullie cadeaubonnen?"],
    ["NEEDS_CALLBACK", "Vraagt of een massage kan tijdens de zwangerschap. Graag terugbellen voor advies.", "Ik ben zwanger, kan ik toch een massage krijgen?"],
    ["CHANGED", "Afspraak een week later gezet, zelfde uur.", "Kan mijn afspraak een week later?"],
    ["CHANGED", "Afspraak geannuleerd wegens ziekte.", "Ik ben ziek, ik moet mijn afspraak annuleren."],
  ]);
  await flush();
  report({ afspraken: created.length, klanten: customers.size, betalingen: pays, gesprekken: calls });
}

// =================== RESTAURANT ===================
if (config.type === "RESTAURANT") {
  const tables = await p.table.findMany({ where: { businessId: B, isActive: true }, orderBy: { capacity: "asc" } });
  if (!tables.length) throw new Error("Geen tafels: teken eerst de plattegrond (floor-plan.mjs).");
  const stay = biz.defaultReservationDurationMinutes ?? 120;
  const seats = tables.reduce((t, x) => t + x.capacity, 0);

  for (let i = 0; i < 30; i++) people.push({ ...person(addDays(FIRST, Math.floor(rnd() * 60))), regular: true, every: 10 + Math.floor(rnd() * 25), next: null });
  for (let i = 0; i < 60; i++) people.push(person(addDays(FIRST, Math.floor(rnd() * 95))));
  people[2].vip = true; people[2].note = "Vaste gast, zit graag aan het raam.";
  const NOTES = ["Notenallergie", "Glutenvrij", "Vegetarisch", "Kinderstoel nodig", "Verjaardag", "Lactose-intolerant", "Tafel aan het raam graag", "Schaaldierenallergie", "Rolstoel", "Jubileum, 10 jaar getrouwd"];

  for (let day = FIRST; day <= LAST; day = addDays(day, 1)) {
    const windows = windowsOf(day);
    if (!windows.length || VACATION.has(day)) continue;
    const weekend = ["FRIDAY", "SATURDAY", "SUNDAY"].includes(dayName(day));
    const busy = new Map(tables.map((t) => [t.id, []]));
    for (const [from, to] of windows) {
      const dinner = from >= 960;
      const fill = (dinner ? (weekend ? 0.85 : 0.55) : weekend ? 0.5 : 0.35) * monthFactor(day) * aheadFactor(day) * (0.8 + rnd() * 0.4);
      let guests = 0;
      for (let tries = 0; guests < seats * fill && tries < 120; tries++) {
        const size = weighted([[2, 46], [3, 10], [4, 26], [5, 5], [6, 8], [8, 4]]);
        const last = Math.max(from, to - 90);
        const start = from + Math.floor((rnd() * (last - from + 1)) / 15) * 15;
        const table = tables.find((t) => t.capacity >= size && t.capacity <= size + 2 && busy.get(t.id).every(([s, e]) => start >= e || start + stay <= s));
        if (!table) continue;
        busy.get(table.id).push([start, start + stay]);
        guests += size;
        const past = day < TODAY || (day === TODAY && start + stay < 600);
        let who;
        const walkIn = past && chance(0.08);
        if (!walkIn) {
          const due = people.filter((x) => x.regular && x.since <= day && (!x.next || x.next <= day));
          if (due.length && chance(0.4)) { who = pick(due); who.next = addDays(day, who.every); }
          else if (chance(0.35)) { who = person(day); people.push(who); }
          else { const pool = people.filter((x) => x.since <= day && !x.regular); who = pool.length ? pick(pool) : person(day); if (!pool.length) people.push(who); }
        }
        const status = past ? weighted([["COMPLETED", 90], ["CANCELLED", 6], ["NO_SHOW", 4]]) : chance(0.04) ? "CANCELLED" : "CONFIRMED";
        created.push({ who, walkIn, table, size, day, start, stay, status, source: walkIn ? "WALK_IN" : weighted(sourceWeights(day)),
          bookedAt: walkIn ? local(day, start) : bookedAtFor(day, start), notes: who?.note && chance(0.3) ? who.note : chance(0.12) ? pick(NOTES) : null });
      }
    }
  }

  const customers = writeCustomers();
  let calls = 0;
  for (const [i, c] of created.entries()) {
    const startTime = local(c.day, c.start);
    const res = add("reservation", {
      businessId: B, customerId: c.who ? customers.get(c.who.phoneNumber) : null,
      firstName: c.who?.firstName ?? "Walk-in", lastName: c.who?.lastName ?? "", phoneNumber: c.who?.phoneNumber ?? "", email: c.who?.email ?? null,
      guestCount: c.size, startTime, endTime: new Date(startTime.getTime() + c.stay * 60000),
      status: c.status, source: c.source, notes: c.notes, createdAt: c.bookedAt, updatedAt: c.bookedAt,
    });
    add("reservationTable", { reservationId: res.id, tableId: c.table.id });
    if (c.source === "AI") {
      bookingCall(i, c, `Reservatie gemaakt voor ${dutch(c.day)} om ${hhmm(c.start)} voor ${c.size} personen.` + (c.notes ? ` ${c.notes}.` : ""),
        `User: Hallo, hebben jullie nog een tafel op ${dutch(c.day)}?\nAI: Voor hoeveel personen?\nUser: Met ${c.size}.\nAI: En hoe laat zou u willen komen?\nUser: Rond ${hhmm(c.start)}.\nAI: Een momentje, ik kijk het even na. Om ${hhmm(c.start)} heb ik nog een tafel voor ${c.size}. Op welke naam mag ik reserveren?\nUser: ${c.who.firstName} ${c.who.lastName}.\nAI: Dank u. Uw tafel voor ${c.size} is gereserveerd op ${dutch(c.day)} om ${hhmm(c.start)}. U krijgt een bevestiging per sms.`);
      calls++;
    }
  }
  calls += await otherCalls([
    ["INFORMATION", "Vraag of er parking is in de buurt.", "Is er parking in de buurt?"],
    ["INFORMATION", "Vraag tot hoe laat de keuken open is.", "Tot hoe laat kan ik nog eten?"],
    ["INFORMATION", "Vraag of er vegetarische gerechten zijn.", "Hebben jullie ook vegetarische gerechten?"],
    ["NEEDS_CALLBACK", "Wil een groepsmenu voor een teamfeest van 20 personen. Graag terugbellen met een voorstel.", "Kunnen we met 20 personen komen voor een teamfeest?"],
    ["CHANGED", "Reservatie verplaatst naar een half uur later.", "Kan mijn reservatie een half uurtje later?"],
    ["CHANGED", "Reservatie geannuleerd.", "Ik moet mijn reservatie van zaterdag annuleren."],
  ]);
  await flush();
  report({ reservaties: created.length, klanten: customers.size, gesprekken: calls });
}

// ---------- shared ----------
function writeCustomers() {
  const first = new Map();
  for (const c of created) if (c.who) { const k = c.who.phoneNumber; if (!first.has(k) || c.bookedAt < first.get(k)) first.set(k, c.bookedAt); }
  const ids = new Map();
  for (const w of new Map(created.filter((c) => c.who).map((c) => [c.who.phoneNumber, c.who])).values()) {
    const row = add("customer", {
      businessId: B, firstName: w.firstName, lastName: w.lastName, phoneNumber: w.phoneNumber, email: w.email,
      isVip: !!w.vip, notes: w.vip ? w.note : null, createdAt: first.get(w.phoneNumber), updatedAt: first.get(w.phoneNumber),
    });
    ids.set(w.phoneNumber, row.id);
  }
  writeCustomers.first = first;
  return ids;
}

function greeting(c) {
  const returning = c.who && c.bookedAt > writeCustomers.first.get(c.who.phoneNumber);
  return returning ? `Goedendag ${c.who.firstName}, welkom terug. Hoe kan ik u helpen?` : `Hallo, bedankt om ${SPOKEN} te bellen. Hoe kan ik u helpen?`;
}

function bookingCall(i, c, summary, body) {
  const dur = 60 + Math.floor(rnd() * 110);
  add("callLog", {
    businessId: B, externalId: `${PREFIX}book-${i}`, callerNumber: c.who.phoneNumber, callerName: `${c.who.firstName} ${c.who.lastName}`,
    startedAt: c.bookedAt, endedAt: new Date(c.bookedAt.getTime() + dur * 1000), durationSeconds: dur, outcome: "BOOKED", summary,
    transcript: `AI: ${greeting(c)}\n${body}\nAI: Kan ik nog iets voor u doen?\nUser: Nee, dat was het.\nAI: Graag gedaan, tot dan!`,
    endedReason: "assistant-ended-call", handledAt: c.bookedAt < local(addDays(TODAY, -2), 0) ? new Date(c.bookedAt.getTime() + 3600e3) : null,
    createdAt: new Date(c.bookedAt.getTime() + dur * 1000),
  });
}

async function otherCalls(kinds) {
  const known = [...new Map(created.filter((c) => c.who).map((c) => [c.who.phoneNumber, c.who])).values()];
  let n = 0;
  for (let i = 0; i < 46; i++) {
    const day = addDays(FIRST, 25 + Math.floor(rnd() * 80));
    if (day >= TODAY || !windowsOf(day).length) continue;
    const [outcome, summary, ask] = pick(kinds);
    const who = pick(known);
    const started = local(day, 540 + Math.floor(rnd() * 600));
    const dur = 40 + Math.floor(rnd() * 90);
    add("callLog", {
      businessId: B, externalId: `${PREFIX}call-${i}`, callerNumber: who.phoneNumber, callerName: chance(0.8) ? `${who.firstName} ${who.lastName}` : null,
      startedAt: started, endedAt: new Date(started.getTime() + dur * 1000), durationSeconds: dur, outcome, summary,
      transcript: `AI: Hallo, bedankt om ${SPOKEN} te bellen. Hoe kan ik u helpen?\nUser: ${ask}\nAI: ${summary}\nUser: Oké, dank u.\nAI: Graag gedaan, een fijne dag nog!`,
      endedReason: "assistant-ended-call", handledAt: outcome === "NEEDS_CALLBACK" && day >= addDays(TODAY, -3) ? null : new Date(started.getTime() + 7200e3),
      createdAt: new Date(started.getTime() + dur * 1000),
    });
    n++;
  }
  return n;
}

function report(counts) {
  const byStatus = created.reduce((m, c) => ((m[c.status] = (m[c.status] ?? 0) + 1), m), {});
  const bySource = created.reduce((m, c) => ((m[c.source] = (m[c.source] ?? 0) + 1), m), {});
  console.log({ periode: `${FIRST} tot ${LAST}`, ...counts, status: byStatus, bron: bySource });
}

await p.$disconnect();
