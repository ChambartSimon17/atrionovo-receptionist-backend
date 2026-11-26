import crypto from "node:crypto";

import { DateTime } from "luxon";

import prisma from "../../db/prisma.js";
import env from "../../config/env.js";
import { BILLING_ZONE, isMonth } from "../billing/usage-math.js";
import {
  billingEnabled,
  cancelPlan,
  runOverage,
  setPlan,
} from "../billing/stripe-billing.service.js";
import { businessReport, monthReport } from "./admin-report.js";
import { renderBusiness, renderCsv, renderOverview } from "./admin-page.js";

// ======================================================
// Admin (our own usage, cost and billing report)
// ======================================================
//
//   GET  /admin                          all accounts, ?month=2026-11
//   GET  /admin/usage.csv                the same as CSV
//   GET  /admin/businesses/:id           one account, 12 months
//   POST /admin/businesses/:id/plan      { plan, interval, trial }
//   POST /admin/businesses/:id/cancel
//   POST /admin/businesses/:id/demo      { isDemo: "1" | "0" }
//   POST /admin/overage                  { month }
//
// Protected with HTTP basic auth: any user name, the
// password is ADMIN_PASSWORD. Without a password of at
// least 16 characters every admin route answers 404.
//
// The browser sends basic auth along with any request, so
// a POST must come from this site itself (Origin or
// Sec-Fetch-Site), against forged forms elsewhere.
// ======================================================

const MIN_PASSWORD_LENGTH = 16;

function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest();
}

export function passwordMatches(header, password) {
  const match = /^Basic\s+(.+)$/i.exec(header ?? "");

  if (!match || !password) {
    return false;
  }

  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const given = decoded.slice(decoded.indexOf(":") + 1);

  return crypto.timingSafeEqual(digest(given), digest(password));
}

export function sameOrigin(headers) {
  const site = headers["sec-fetch-site"];

  if (site) {
    return site === "same-origin";
  }

  const origin = headers.origin;

  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).host === headers.host;
  } catch {
    return false;
  }
}

function currentMonth() {
  return DateTime.now().setZone(BILLING_ZONE).toFormat("yyyy-MM");
}

function monthFrom(query) {
  return isMonth(query?.month) ? query.month : currentMonth();
}

function flashFrom(query) {
  return query?.msg ? { message: String(query.msg).slice(0, 300), error: query.err === "1" } : null;
}

function back(reply, path, message, error = false) {
  const separator = path.includes("?") ? "&" : "?";

  return reply
    .code(303)
    .header("Location", `${path}${separator}msg=${encodeURIComponent(message)}${error ? "&err=1" : ""}`)
    .send();
}

function rates() {
  return {
    USD: env.usdToEur,
    callEstimate: env.callCostEstimateEurPerMinute,
    smsEstimate: env.smsCostEstimateEurPerSegment,
  };
}

export default async function adminRoutes(fastify) {
  fastify.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string", bodyLimit: 10_000 },
    (request, body, done) => done(null, Object.fromEntries(new URLSearchParams(body)))
  );

  fastify.addHook("onRequest", async (request, reply) => {
    const password = env.adminPassword;

    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return reply.code(404).send({ success: false, message: "Not found" });
    }

    reply.header("Cache-Control", "no-store");
    reply.header("X-Frame-Options", "DENY");
    reply.header("X-Robots-Tag", "noindex, nofollow");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"
    );

    if (!passwordMatches(request.headers.authorization, password)) {
      return reply
        .code(401)
        .header("WWW-Authenticate", 'Basic realm="AtrioNovo admin", charset="UTF-8"')
        .send("Login required");
    }

    if (request.method === "POST" && !sameOrigin(request.headers)) {
      return reply.code(403).send("Forbidden");
    }
  });

  fastify.get("/", async (request, reply) => {
    const report = await monthReport(monthFrom(request.query));

    return reply
      .type("text/html; charset=utf-8")
      .send(renderOverview(report, { flash: flashFrom(request.query), billingOn: billingEnabled(), rates: rates() }));
  });

  fastify.get("/usage.csv", async (request, reply) => {
    const month = monthFrom(request.query);
    const report = await monthReport(month);

    return reply
      .type("text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="atrionovo-verbruik-${month}.csv"`)
      .send(renderCsv(report));
  });

  fastify.get("/businesses/:id", async (request, reply) => {
    const report = await businessReport(request.params.id, monthFrom(request.query));

    if (!report) {
      return reply.code(404).type("text/html; charset=utf-8").send("Account niet gevonden.");
    }

    return reply
      .type("text/html; charset=utf-8")
      .send(renderBusiness(report, { flash: flashFrom(request.query), billingOn: billingEnabled() }));
  });

  fastify.post("/businesses/:id/plan", async (request, reply) => {
    const path = `/admin/businesses/${encodeURIComponent(request.params.id)}`;
    const body = request.body ?? {};

    try {
      const business = await setPlan(request.params.id, {
        planId: body.plan,
        interval: body.interval === "YEAR" ? "YEAR" : "MONTH",
        trial: body.trial === "1",
      });

      return back(reply, path, `Abonnement: ${business.billingPlan}, status ${business.subscriptionStatus}.`);
    } catch (error) {
      request.log.warn({ error: error.message }, "Admin: plan not set");
      return back(reply, path, `Niet gelukt: ${error.message}`, true);
    }
  });

  fastify.post("/businesses/:id/cancel", async (request, reply) => {
    const path = `/admin/businesses/${encodeURIComponent(request.params.id)}`;

    try {
      await cancelPlan(request.params.id);

      return back(reply, path, "Het abonnement stopt op het einde van de betaalde periode.");
    } catch (error) {
      return back(reply, path, `Niet gelukt: ${error.message}`, true);
    }
  });

  fastify.post("/businesses/:id/demo", async (request, reply) => {
    const path = `/admin/businesses/${encodeURIComponent(request.params.id)}`;
    const isDemo = request.body?.isDemo === "1";

    try {
      const business = await prisma.business.findUnique({ where: { id: request.params.id } });

      if (isDemo && business?.stripeSubscriptionId && business.subscriptionStatus !== "canceled") {
        return back(reply, path, "Zeg eerst het abonnement op: een demo wordt nooit gefactureerd.", true);
      }

      await prisma.business.update({ where: { id: request.params.id }, data: { isDemo } });

      return back(reply, path, isDemo ? "Gemarkeerd als demo." : "Geen demo meer.");
    } catch (error) {
      return back(reply, path, `Niet gelukt: ${error.message}`, true);
    }
  });

  fastify.post("/overage", async (request, reply) => {
    const month = request.body?.month;

    if (!isMonth(month)) {
      return back(reply, "/admin", "Geef een maand als 2026-11.", true);
    }

    try {
      const results = await runOverage(month, { log: request.log });
      const invoiced = results.filter((result) => result.invoiceId && !result.skipped).length;
      const failed = results.filter((result) => result.error).length;

      return back(
        reply,
        `/admin?month=${month}`,
        `${invoiced} facturen gemaakt, ${results.length - invoiced - failed} overgeslagen${failed ? `, ${failed} mislukt (zie logs)` : ""}.`,
        failed > 0
      );
    } catch (error) {
      return back(reply, "/admin", `Niet gelukt: ${error.message}`, true);
    }
  });
}
