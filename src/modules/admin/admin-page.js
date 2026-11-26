import { DateTime } from "luxon";

import { PLANS } from "../billing/plans.js";
import { BILLING_ZONE, monthLabel, shiftMonth } from "../billing/usage-math.js";

// ======================================================
// Admin pages (HTML)
// ======================================================
//
// Server-rendered, no scripts. Every value from the
// database goes through esc().
// ======================================================

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const nf = new Intl.NumberFormat("nl-BE");
const ef = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });

function eur(cents, { approx = false } = {}) {
  if (cents === null || cents === undefined) {
    return "–";
  }

  return `${approx ? "≈ " : ""}${ef.format(cents / 100)}`;
}

function num(value) {
  return value === null || value === undefined ? "–" : nf.format(value);
}

function pct(value) {
  return value === null || value === undefined ? "–" : `${Math.round(value)}%`;
}

function date(value) {
  return value
    ? DateTime.fromJSDate(new Date(value), { zone: BILLING_ZONE }).setLocale("nl").toFormat("d LLL yyyy")
    : "–";
}

const STATUS = {
  trialing: ["Proef", "info"],
  active: ["Actief", "ok"],
  past_due: ["Achterstallig", "bad"],
  unpaid: ["Onbetaald", "bad"],
  incomplete: ["Onvolledig", "bad"],
  incomplete_expired: ["Verlopen", "bad"],
  canceled: ["Opgezegd", "muted"],
  paused: ["Gepauzeerd", "muted"],
};

function statusBadge(account) {
  if (account.isDemo) {
    return `<span class="badge muted">Demo</span>`;
  }

  if (!account.planId) {
    return `<span class="badge muted">Geen plan</span>`;
  }

  if (!account.status) {
    return `<span class="badge muted">${esc(account.plan)}</span>`;
  }

  const [label, tone] = STATUS[account.status] ?? [account.status, "muted"];
  const plan = `${esc(account.plan)}${account.interval === "YEAR" ? " · jaar" : ""}`;
  const end = account.cancelAtPeriodEnd ? ` <span class="badge muted">stopt</span>` : "";

  return `${plan} <span class="badge ${tone}">${esc(label)}</span>${end}`;
}

function marginCell(row) {
  if (!row.revenueCents) {
    return `<td class="n muted">${row.costCents ? eur(-row.costCents) : "–"}</td><td class="n muted">–</td>`;
  }

  const tone = row.marginCents < 0 ? "bad" : row.marginPercent < 50 ? "warn" : "ok";

  return `<td class="n ${tone}">${eur(row.marginCents)}</td><td class="n ${tone}">${pct(row.marginPercent)}</td>`;
}

function usageCell(used, included, extra) {
  if (!included) {
    return `<td class="n">${num(used)}</td>`;
  }

  const ratio = Math.min(1, used / included);
  const tone = used > included ? "bad" : ratio > 0.8 ? "warn" : "ok";

  return `<td class="n"><div>${num(used)} <span class="muted">/ ${num(included)}</span>${extra ? ` <span class="bad">+${num(extra)}</span>` : ""}</div><div class="bar"><i class="${tone}" style="width:${Math.round(ratio * 100)}%"></i></div></td>`;
}

const HEAD = `<tr>
  <th>Account</th><th>Plan</th>
  <th class="n">Gesprekken</th><th class="n">Minuten</th><th class="n">Sms</th>
  <th class="n">AI-boekingen</th>
  <th class="n">Kost</th><th class="n">Omzet</th><th class="n">Gefactureerd</th>
  <th class="n">Marge</th><th class="n">%</th>
</tr>`;

function accountRow(row, month) {
  const a = row.account;

  return `<tr class="${a.problem ? "problem" : ""}">
    <td><a href="/admin/businesses/${esc(a.id)}?month=${esc(month)}">${esc(a.name)}</a><div class="muted small">${a.type === "MASSAGE" ? "Massage" : "Restaurant"}</div></td>
    <td>${statusBadge(a)}</td>
    <td class="n">${num(row.calls)}</td>
    ${usageCell(row.minutes, row.includedMinutes, row.extraMinutes)}
    ${usageCell(row.sms, row.includedSms, row.extraSms)}
    <td class="n">${num(row.aiBookings)}</td>
    <td class="n" title="Gesprekken ${esc(eur(row.callCostCents))} · Sms ${esc(eur(row.smsCostCents))}">${eur(row.costCents, { approx: row.estimated })}</td>
    <td class="n">${eur(row.revenueCents)}</td>
    <td class="n muted">${row.invoicedCents ? eur(row.invoicedCents) : "–"}</td>
    ${marginCell(row)}
  </tr>`;
}

function totalRow(label, totals) {
  return `<tr class="total">
    <td colspan="2">${esc(label)}</td>
    <td class="n">${num(totals.calls)}</td>
    <td class="n">${num(totals.minutes)}</td>
    <td class="n">${num(totals.sms)}</td>
    <td class="n">${num(totals.aiBookings)}</td>
    <td class="n">${eur(totals.costCents, { approx: totals.estimated })}</td>
    <td class="n">${eur(totals.revenueCents)}</td>
    <td class="n">${totals.invoicedCents ? eur(totals.invoicedCents) : "–"}</td>
    ${marginCell(totals)}
  </tr>`;
}

function card(label, value, sub = "") {
  return `<div class="card"><div class="label">${esc(label)}</div><div class="value">${value}</div>${sub ? `<div class="muted small">${sub}</div>` : ""}</div>`;
}

function historyTable(months, { outcomes = false } = {}) {
  const max = Math.max(1, ...months.map((m) => m.minutes));

  return `<table class="history">
    <tr><th>Maand</th><th class="n">Gesprekken</th><th class="n">Minuten</th><th></th><th class="n">Sms</th><th class="n">AI-boekingen</th>${outcomes ? `<th class="n">Terugbellen</th>` : ""}<th class="n">Kost</th><th class="n">Gefactureerd</th><th class="n">Marge</th><th class="n">Kost / min</th></tr>
    ${months
      .slice()
      .reverse()
      .map(
        (m) => `<tr>
      <td>${esc(monthLabel(m.month))}</td>
      <td class="n">${num(m.calls)}</td>
      <td class="n">${num(m.minutes)}</td>
      <td class="spark"><div class="bar"><i class="ok" style="width:${Math.round((m.minutes / max) * 100)}%"></i></div></td>
      <td class="n">${num(m.sms)}</td>
      <td class="n">${num(m.aiBookings)}</td>
      ${outcomes ? `<td class="n">${num(m.outcomes.NEEDS_CALLBACK)}</td>` : ""}
      <td class="n">${eur(m.costCents, { approx: m.estimated })}</td>
      <td class="n">${m.invoicedCents ? eur(m.invoicedCents) : "–"}</td>
      <td class="n ${m.marginCents < 0 && m.invoicedCents ? "bad" : ""}">${m.invoicedCents ? eur(m.marginCents) : "–"}</td>
      <td class="n">${m.minutes ? eur(Math.round(m.costCents / m.minutes)) : "–"}</td>
    </tr>`
      )
      .join("")}
  </table>`;
}

function monthNav(month, base) {
  const current = DateTime.now().setZone(BILLING_ZONE).toFormat("yyyy-MM");
  const next = shiftMonth(month, 1);

  return `<nav class="months">
    <a href="${base}?month=${esc(shiftMonth(month, -1))}">‹</a>
    <strong>${esc(monthLabel(month))}</strong>
    ${next <= current ? `<a href="${base}?month=${esc(next)}">›</a>` : `<span class="muted">›</span>`}
    ${month !== current ? `<a class="small" href="${base}">deze maand</a>` : ""}
  </nav>`;
}

function flashBox(flash) {
  if (!flash?.message) {
    return "";
  }

  return `<div class="flash ${flash.error ? "bad" : "ok"}">${esc(flash.message)}</div>`;
}

function layout(title, body) {
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} · AtrioNovo admin</title>
<style>
  :root { --bg:#f7f5f1; --card:#fff; --text:#1d1b18; --muted:#7a746b; --line:#e7e2da;
    --ok:#2f7d55; --warn:#b7791f; --bad:#c2412d; --info:#2b6cb0; --accent:#1d1b18; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#151412; --card:#1e1c19; --text:#eeeae4; --muted:#9a9389; --line:#302d28;
      --ok:#5cc08a; --warn:#e0a843; --bad:#ef7b67; --info:#78a9e8; --accent:#eeeae4; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
    font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }
  main { max-width: 1240px; margin: 0 auto; padding: 28px 24px 64px; }
  header { display:flex; align-items:baseline; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:20px; }
  h1 { font-size: 22px; margin:0; }
  h2 { font-size: 15px; margin: 32px 0 10px; }
  a { color: inherit; }
  .muted { color: var(--muted); }
  .small { font-size: 12px; }
  .months { display:flex; gap:12px; align-items:center; }
  .months a { text-decoration:none; padding:2px 8px; border:1px solid var(--line); border-radius:8px; }
  .cards { display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:12px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px 16px; }
  .card .label { color:var(--muted); font-size:12px; }
  .card .value { font-size:22px; font-weight:600; margin-top:2px; font-variant-numeric: tabular-nums; }
  .table { background:var(--card); border:1px solid var(--line); border-radius:12px; overflow-x:auto; }
  table { border-collapse: collapse; width:100%; }
  th, td { padding: 9px 12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; white-space:nowrap; }
  th { font-size:12px; font-weight:600; color:var(--muted); }
  tr:last-child td { border-bottom:0; }
  .n { text-align:right; font-variant-numeric: tabular-nums; }
  tr.total td { font-weight:600; background: color-mix(in srgb, var(--line) 35%, transparent); }
  tr.problem td:first-child { box-shadow: inset 3px 0 0 var(--bad); }
  .ok { color:var(--ok); } .warn { color:var(--warn); } .bad { color:var(--bad); } .info { color:var(--info); }
  .badge { display:inline-block; font-size:11px; font-weight:600; padding:1px 7px; border-radius:999px;
    border:1px solid currentColor; margin-left:4px; }
  .badge.muted { color: var(--muted); }
  .bar { height:4px; background:var(--line); border-radius:2px; margin-top:4px; min-width:60px; }
  .bar i { display:block; height:100%; border-radius:2px; background: currentColor; }
  .spark { width: 120px; }
  .flash { padding:10px 14px; border-radius:10px; border:1px solid currentColor; margin-bottom:16px; }
  .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap:16px; }
  @media (max-width: 800px) { .grid2 { grid-template-columns: 1fr; } }
  form { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin: 8px 0; }
  select, input, button { font: inherit; padding:6px 10px; border-radius:8px; border:1px solid var(--line);
    background: var(--card); color: var(--text); }
  button { cursor:pointer; font-weight:600; }
  button.primary { background: var(--accent); color: var(--bg); border-color: var(--accent); }
  .note { color:var(--muted); font-size:12px; margin-top:8px; }
  dl { display:grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin:0; }
  dt { color: var(--muted); }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

/**
 * The overview: all accounts of one month.
 */
export function renderOverview(report, { flash, billingOn, rates }) {
  const t = report.customerTotals;
  const all = report.allTotals;

  const body = `
  <header>
    <h1>Verbruik en kosten</h1>
    ${monthNav(report.month, "/admin")}
    <a class="small" href="/admin/usage.csv?month=${esc(report.month)}">CSV downloaden</a>
  </header>
  ${flashBox(flash)}
  <div class="cards">
    ${card("Betalende klanten", num(report.counts.paying), `${num(report.counts.trialing)} in proef${report.counts.problems ? ` · <span class="bad">${num(report.counts.problems)} met betaalprobleem</span>` : ""}`)}
    ${card("Gesprekken", num(all.calls), `${num(all.minutes)} minuten · ${num(all.sms)} sms`)}
    ${card("Kost (alles)", eur(all.costCents, { approx: all.estimated }), all.costPerMinuteCents !== null ? `${eur(Math.round(all.costPerMinuteCents))} per minuut` : "")}
    ${card("Omzet klanten", eur(t.revenueCents), "plan + extra, excl. btw")}
    ${card("Marge klanten", `<span class="${t.marginCents < 0 ? "bad" : ""}">${eur(t.marginCents)}</span>`, pct(t.marginPercent))}
    ${card("Kost per AI-boeking", eur(t.costPerBookingCents === null ? null : Math.round(t.costPerBookingCents)), `${num(t.aiBookings)} boekingen door de AI`)}
  </div>

  <h2>Klanten</h2>
  <div class="table"><table>
    ${HEAD}
    ${report.customers.map((row) => accountRow(row, report.month)).join("") || `<tr><td colspan="11" class="muted">Geen klanten met verbruik deze maand.</td></tr>`}
    ${totalRow("Totaal klanten", t)}
  </table></div>

  <h2>Demo-accounts</h2>
  <div class="table"><table>
    ${HEAD}
    ${report.demos.map((row) => accountRow(row, report.month)).join("") || `<tr><td colspan="11" class="muted">Geen demo's met verbruik deze maand.</td></tr>`}
    ${totalRow("Totaal demo's", report.demoTotals)}
    <tr><td colspan="2">Live demo op de website<div class="muted small">Eigen kost, nooit gefactureerd</div></td>
      <td class="n">${num(report.internal.calls)}</td><td class="n">${num(report.internal.minutes)}</td><td class="n">${num(report.internal.sms)}</td><td class="n">–</td>
      <td class="n">${eur(report.internal.costCents, { approx: report.internal.estimated })}</td><td class="n">–</td><td class="n">–</td><td class="n">–</td><td class="n">–</td></tr>
  </table></div>

  <h2>Laatste 12 maanden (alle accounts)</h2>
  <div class="table">${historyTable(report.history)}</div>

  <h2>Extra verbruik factureren</h2>
  <div class="card">
    ${billingOn
      ? `<form method="post" action="/admin/overage">
          <label>Maand <input name="month" value="${esc(shiftMonth(report.month, report.month === DateTime.now().setZone(BILLING_ZONE).toFormat("yyyy-MM") ? -1 : 0))}" pattern="\\d{4}-\\d{2}" size="8"></label>
          <button>Nu factureren</button>
        </form>
        <div class="note">Gebeurt vanzelf van de 1ste tot de 7de van elke maand. Een maand die al gefactureerd is, wordt overgeslagen.</div>`
      : `<div class="muted">Facturatie in Stripe staat uit (STRIPE_BILLING_ENABLED). Verbruik en kosten worden wel bijgehouden.</div>`}
  </div>

  <p class="note">Kost = wat Vapi en Twilio aanrekenden, omgerekend aan ${esc(String(rates.USD).replace(".", ","))} € per $. “≈” betekent dat een deel nog geschat is (${esc(eur(Math.round(rates.callEstimate * 100)))} per minuut, ${esc(eur(Math.round(rates.smsEstimate * 100)))} per sms) tot de provider de echte kost doorgeeft. Omzet = plan (jaarplan per maand, niets tijdens de proef) + extra minuten en sms van deze maand. Gefactureerd = wat Stripe deze maand factureerde, excl. btw. Vaste kosten (telefoonnummers, Render, Stripe) zitten er niet in.${report.unassignedRecords ? ` ${num(report.unassignedRecords)} records horen bij een verwijderde zaak.` : ""}</p>
  `;

  return layout("Verbruik", body);
}

function planForm(account) {
  const options = Object.values(PLANS)
    .map((plan) => `<option value="${plan.id}" ${account.planId === plan.id ? "selected" : ""}>${esc(plan.name)} (${esc(ef.format(plan.monthCents / 100))}/m · ${plan.includedMinutes} min)</option>`)
    .join("");

  return `<form method="post" action="/admin/businesses/${esc(account.id)}/plan">
    <select name="plan">${options}</select>
    <select name="interval">
      <option value="MONTH" ${account.interval !== "YEAR" ? "selected" : ""}>maandelijks</option>
      <option value="YEAR" ${account.interval === "YEAR" ? "selected" : ""}>jaarlijks (1 maand gratis)</option>
    </select>
    ${account.hasSubscription ? "" : `<label><input type="checkbox" name="trial" value="1" checked> 14 dagen proef</label>`}
    <button class="primary">${account.hasSubscription && account.status !== "canceled" ? "Plan wijzigen" : "Abonnement starten"}</button>
  </form>`;
}

/**
 * One business: account, plan actions, history, invoices.
 */
export function renderBusiness(report, { flash, billingOn }) {
  const a = report.account;
  const r = report.row;
  const base = `/admin/businesses/${esc(a.id)}`;

  const body = `
  <header>
    <div><a class="small" href="/admin?month=${esc(report.month)}">‹ Alle accounts</a><h1>${esc(a.name)}</h1></div>
    ${monthNav(report.month, base)}
  </header>
  ${flashBox(flash)}
  <div class="cards">
    ${card("Gesprekken", num(r.calls), `${num(r.aiBookings)} AI-boekingen`)}
    ${card("Minuten", `${num(r.minutes)}${r.includedMinutes ? ` <span class="muted small">/ ${num(r.includedMinutes)}</span>` : ""}`, r.extraMinutes ? `<span class="bad">${num(r.extraMinutes)} extra</span>` : "")}
    ${card("Sms", `${num(r.sms)}${r.includedSms ? ` <span class="muted small">/ ${num(r.includedSms)}</span>` : ""}`, r.extraSms ? `<span class="bad">${num(r.extraSms)} extra</span>` : "")}
    ${card("Kost", eur(r.costCents, { approx: r.estimated }), `gesprekken ${eur(r.callCostCents)} · sms ${eur(r.smsCostCents)}`)}
    ${card("Omzet", eur(r.revenueCents), r.revenueCents ? `marge ${eur(r.marginCents)} (${pct(r.marginPercent)})` : "")}
    ${card("Kost per AI-boeking", eur(r.costPerBookingCents === null ? null : Math.round(r.costPerBookingCents)))}
  </div>

  <div class="grid2">
    <div>
      <h2>Account</h2>
      <div class="card"><dl>
        <dt>Type</dt><dd>${a.type === "MASSAGE" ? "Massage" : "Restaurant"} · ${esc(a.slug)}</dd>
        <dt>Plan</dt><dd>${statusBadge(a)}</dd>
        ${a.trialEndsAt ? `<dt>Proef tot</dt><dd>${date(a.trialEndsAt)}</dd>` : ""}
        <dt>Klant sinds</dt><dd>${date(a.createdAt)}</dd>
      </dl></div>
    </div>
    <div>
      <h2>Abonnement</h2>
      <div class="card">
        ${a.isDemo
          ? `<div class="muted">Demo-account: wordt nooit gefactureerd.</div>`
          : billingOn
            ? `${planForm(a)}
               ${a.hasSubscription && a.status !== "canceled" && !a.cancelAtPeriodEnd
                 ? `<form method="post" action="${base}/cancel"><button>Opzeggen op het einde van de periode</button></form>`
                 : ""}`
            : `<div class="muted">Facturatie in Stripe staat uit (STRIPE_BILLING_ENABLED).</div>`}
        <form method="post" action="${base}/demo">
          <input type="hidden" name="isDemo" value="${a.isDemo ? "0" : "1"}">
          <button>${a.isDemo ? "Geen demo meer" : "Markeer als demo"}</button>
        </form>
      </div>
    </div>
  </div>

  <h2>Laatste 12 maanden</h2>
  <div class="table">${historyTable(report.history, { outcomes: true })}</div>

  <h2>Facturen</h2>
  <div class="table"><table>
    <tr><th>Datum</th><th>Nummer</th><th>Soort</th><th>Status</th><th class="n">Excl. btw</th><th class="n">Incl. btw</th><th></th></tr>
    ${report.invoices
      .map(
        (invoice) => `<tr>
      <td>${date(invoice.issuedAt)}</td>
      <td>${esc(invoice.number ?? "–")}</td>
      <td>${invoice.kind === "OVERAGE" ? `Extra verbruik ${esc(invoice.usageMonth ? monthLabel(invoice.usageMonth) : "")}` : "Abonnement"}</td>
      <td class="${invoice.status === "paid" ? "ok" : invoice.status === "open" || invoice.status === "uncollectible" ? "bad" : "muted"}">${esc(invoice.status)}</td>
      <td class="n">${eur(invoice.subtotalCents)}</td>
      <td class="n">${eur(invoice.totalCents)}</td>
      <td>${invoice.hostedInvoiceUrl ? `<a href="${esc(invoice.hostedInvoiceUrl)}" rel="noreferrer" target="_blank">bekijk</a>` : ""}</td>
    </tr>`
      )
      .join("") || `<tr><td colspan="7" class="muted">Nog geen facturen.</td></tr>`}
  </table></div>
  `;

  return layout(a.name, body);
}

/**
 * The month as CSV for Excel (Belgian settings: semicolons
 * and decimal commas, with a BOM so accents survive).
 */
export function renderCsv(report) {
  const money = (cents) => (cents === null || cents === undefined ? "" : (cents / 100).toFixed(2).replace(".", ","));
  const cell = (value) => {
    const text = String(value ?? "");

    // Quote, and keep Excel from running formulas (a
    // negative amount stays a number).
    const formula = /^[=+\-@]/.test(text) && !/^-\d+(,\d+)?$/.test(text);

    return `"${(formula ? `'${text}` : text).replace(/"/g, '""')}"`;
  };

  const header = [
    "Maand", "Account", "Groep", "Type", "Plan", "Interval", "Status",
    "Gesprekken", "Minuten", "Inbegrepen minuten", "Extra minuten",
    "Sms", "Inbegrepen sms", "Extra sms", "AI-boekingen",
    "Kost gesprekken", "Kost sms", "Kost totaal", "Kost geschat",
    "Omzet", "Gefactureerd", "Marge",
  ];

  const line = (row, group) => {
    const a = row.account ?? {};

    return [
      report.month, a.name ?? "Live demo website", group, a.type ?? "", a.plan ?? "", a.planId ? a.interval : "", a.status ?? "",
      row.calls, row.minutes, row.includedMinutes ?? 0, row.extraMinutes,
      row.sms, row.includedSms ?? 0, row.extraSms, row.aiBookings,
      money(row.callCostCents), money(row.smsCostCents), money(row.costCents), row.estimated ? "ja" : "nee",
      money(row.revenueCents), money(row.invoicedCents), money(row.marginCents),
    ].map(cell).join(";");
  };

  return `﻿${[
    header.map(cell).join(";"),
    ...report.customers.map((row) => line(row, "Klant")),
    ...report.demos.map((row) => line(row, "Demo")),
    line(report.internal, "Eigen gebruik"),
  ].join("\r\n")}\r\n`;
}
