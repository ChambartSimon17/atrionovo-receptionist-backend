// Removes a (test) customer from a demo account, with all of
// their appointments or reservations, payments and calls.
// Usage: node scripts/demo/remove-customer.mjs scripts/demo/demos/<slug>.json "Voornaam Achternaam"
import { loadConfig, prisma } from "./lib.mjs";

const config = loadConfig(process.argv[2]);
const name = (process.argv[3] ?? "").trim();
if (!name.includes(" ")) throw new Error('Geef voornaam en achternaam mee, bv. "Simon De Moen"');
const [firstName, ...last] = name.split(/\s+/);
const lastName = last.join(" ");

const p = await prisma();
const B = config.businessId;
const insensitive = (v) => ({ equals: v, mode: "insensitive" });
const who = { businessId: B, firstName: insensitive(firstName), lastName: insensitive(lastName) };

const customers = await p.customer.findMany({ where: who });
const phones = customers.map((c) => c.phoneNumber).filter(Boolean);
const bookings = { OR: [who, { businessId: B, customerId: { in: customers.map((c) => c.id) } }] };

let removed;
if (config.type === "MASSAGE") {
  const appts = await p.appointment.findMany({ where: bookings, select: { id: true } });
  await p.payment.deleteMany({ where: { appointmentId: { in: appts.map((a) => a.id) } } });
  removed = (await p.appointment.deleteMany({ where: { id: { in: appts.map((a) => a.id) } } })).count;
} else {
  removed = (await p.reservation.deleteMany({ where: bookings })).count;
}
const calls = phones.length ? (await p.callLog.deleteMany({ where: { businessId: B, callerNumber: { in: phones } } })).count : 0;
const gone = (await p.customer.deleteMany({ where: { id: { in: customers.map((c) => c.id) } } })).count;

console.log(`${name}: ${gone} klant(en), ${removed} ${config.type === "MASSAGE" ? "afspraken" : "reservaties"}, ${calls} gesprekken verwijderd`);
await p.$disconnect();
