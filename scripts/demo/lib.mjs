// Shared helpers for the demo scripts (see scripts/demo/README.md).
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const API = "https://atrionovo-receptionist-backend.onrender.com";
export const LOGINS = join(ROOT, "demo-logins.local.txt");
export const TZ = "Europe/Brussels";
export const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

// ---------- config ----------
export function loadConfig(path) {
  if (!path) throw new Error("Geef het pad naar de demo-config mee, bv. scripts/demo/demos/volckerick.json");
  const full = resolve(path);
  const config = JSON.parse(readFileSync(full, "utf8"));
  config.__path = full;
  for (const key of ["type", "name", "slug", "email", "openingHours"]) {
    if (!config[key]) throw new Error(`Config mist "${key}"`);
  }
  if (!["MASSAGE", "RESTAURANT"].includes(config.type)) throw new Error('type moet "MASSAGE" of "RESTAURANT" zijn');
  return config;
}

export function saveConfig(config) {
  const { __path, ...rest } = config;
  writeFileSync(__path, JSON.stringify(rest, null, 2) + "\n");
}

// ---------- env ----------
export async function loadEnv(file = ".env") {
  const dotenv = await import("dotenv");
  dotenv.config({ path: join(ROOT, file), override: true, quiet: true });
}

export async function prisma() {
  await loadEnv(".env.render");
  const { PrismaClient } = await import("@prisma/client");
  return new PrismaClient();
}

// ---------- backend API ----------
export async function call(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json.data ?? json;
}

export function passwordFor(email) {
  if (!existsSync(LOGINS)) return null;
  const lines = readFileSync(LOGINS, "utf8").split("\n").map((l) => l.trim());
  const i = lines.lastIndexOf(email);
  return i >= 0 ? lines[i + 1] : null;
}

export function rememberLogin(label, email, password) {
  appendFileSync(LOGINS, `\n${label}\n${email}\n${password}\n`, { mode: 0o600 });
}

export async function login(config) {
  const password = passwordFor(config.email);
  if (!password) throw new Error(`Geen wachtwoord voor ${config.email} in demo-logins.local.txt`);
  const res = await call("POST", "/auth/login", { email: config.email, password });
  return { token: res.accessToken, businessId: res.business.id };
}

// ---------- time ----------
export const toMinutes = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
export const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const dayName = (d) => DAYS[(new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7];
export const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

// Local Brussels time on a day -> UTC Date
export function local(day, minutes) {
  const guess = new Date(`${day}T00:00:00Z`).getTime() + minutes * 60000;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess));
  const h = +parts.find((x) => x.type === "hour").value, m = +parts.find((x) => x.type === "minute").value;
  const offset = (h * 60 + m - (minutes % 1440) + 1440) % 1440;
  return new Date(guess - offset * 60000);
}

// Opening hours from the config: { "TUESDAY": [["10:00","19:00"]], ... }
export function openingRows(config) {
  const rows = [];
  for (const [day, windows] of Object.entries(config.openingHours)) {
    for (const [from, to] of windows) rows.push({ dayOfWeek: day, opensAtMinutes: toMinutes(from), closesAtMinutes: toMinutes(to) });
  }
  return rows;
}

const NL_DAYS = { MONDAY: "maandag", TUESDAY: "dinsdag", WEDNESDAY: "woensdag", THURSDAY: "donderdag", FRIDAY: "vrijdag", SATURDAY: "zaterdag", SUNDAY: "zondag" };
const uur = (hm) => { const m = toMinutes(hm); return m % 60 ? `${Math.floor(m / 60)} uur ${m % 60}` : `${m / 60} uur`; };

// "dinsdag tot en met zaterdag, van 10 uur tot 19 uur"
export function openingDaysText(config) {
  if (config.openingDaysText) return config.openingDaysText;
  const groups = [];
  for (const day of DAYS) {
    const w = config.openingHours[day];
    if (!w?.length) continue;
    const key = w.map(([a, b]) => `van ${uur(a)} tot ${uur(b)}`).join(" en ");
    const last = groups.at(-1);
    if (last && last.key === key && DAYS.indexOf(last.days.at(-1)) === DAYS.indexOf(day) - 1) last.days.push(day);
    else groups.push({ key, days: [day] });
  }
  return groups.map(({ key, days }) => {
    const d = days.length === 1 ? NL_DAYS[days[0]] : days.length === 2 ? `${NL_DAYS[days[0]]} en ${NL_DAYS[days[1]]}` : `${NL_DAYS[days[0]]} tot en met ${NL_DAYS[days.at(-1)]}`;
    return `${d}, ${key}`;
  }).join("; ") + ". Op de andere dagen is de zaak gesloten.";
}

// Massage services: one entry per type, with one or more durations.
// "services": [{ "type": "Emotional Release Massage", "durations": [[60, 80], [90, 115]], "description": "..." }]
export function serviceRows(config) {
  return config.services.flatMap((s) => s.durations.map(([durationMinutes, euro]) => ({
    name: s.durations.length > 1 ? `${s.type} ${durationMinutes} min` : s.type,
    type: s.type,
    durationMinutes,
    priceCents: Math.round(euro * 100),
    description: s.description ?? null,
  })));
}

// ---------- deterministic random ----------
export function random(seed) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const chance = (x) => rnd() < x;
  const weighted = (pairs) => { let r = rnd() * pairs.reduce((t, [, w]) => t + w, 0); for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; } return pairs[0][0]; };
  return { rnd, pick, chance, weighted };
}

export const seedFrom = (text) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
