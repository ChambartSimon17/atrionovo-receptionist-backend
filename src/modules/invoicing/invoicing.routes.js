import { z } from "zod";

import { authenticate } from "../../middleware/auth.middleware.js";
import { requireBusinessOwnership } from "../../middleware/business-ownership.middleware.js";

import invoicingService from "./invoicing.service.js";

// ======================================================
// Invoicing routes
// ======================================================
//
// prefix /businesses/:businessId
//   GET  /invoicing                       settings
//   PUT  /invoicing
//   GET  /vat-lookup?number               VIES
//   POST /payments/:paymentId/documents   kasticket or factuur
//   GET  /documents?month&kind
//   GET  /documents/export?month          CSV
//   GET  /documents/:documentId
//   GET  /documents/:documentId/pdf
//   GET  /documents/:documentId/ubl       Peppol XML
//   POST /documents/:documentId/email     { email }
//   POST /documents/:documentId/convert   kasticket → factuur
//   POST /documents/:documentId/credit    creditnota
// ======================================================

const text = (max) => z.string().trim().max(max);

const settingsSchema = z.object({
  legalName: text(150).optional().nullable(),
  vatNumber: text(30).optional().nullable(),
  street: text(150).optional().nullable(),
  postalCode: text(12).optional().nullable(),
  city: text(80).optional().nullable(),
  country: z.string().length(2).optional().nullable(),
  iban: text(40).optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  vatExempt: z.boolean().optional(),
  vatRate: z.number().int().min(0).max(25).optional(),
});

const buyerSchema = z.object({
  name: text(150).min(1),
  vatNumber: text(30).optional().nullable(),
  street: text(150).optional().nullable(),
  postalCode: text(12).optional().nullable(),
  city: text(80).optional().nullable(),
  country: z.string().length(2).optional().nullable(),
});

const issueSchema = z.object({
  kind: z.enum(["RECEIPT", "INVOICE"]),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  buyer: buyerSchema.optional(),
  saveToCustomer: z.boolean().optional(),
});

const month = z.string().regex(/^\d{4}-\d{2}$/);

const preHandler = [authenticate, requireBusinessOwnership];

const ok = (data) => ({ success: true, data });

export default async function invoicingRoutes(fastify) {
  const route = (method, path, handler) =>
    fastify[method](`/:businessId${path}`, { preHandler }, handler);

  route("get", "/invoicing", async (request) =>
    ok(await invoicingService.getSettings(request.params.businessId))
  );

  route("put", "/invoicing", async (request) =>
    ok(
      await invoicingService.updateSettings(
        request.params.businessId,
        settingsSchema.parse(request.body)
      )
    )
  );

  route("get", "/vat-lookup", async (request) => {
    const { number } = z.object({ number: text(30) }).parse(request.query ?? {});

    return ok(await invoicingService.lookup(number));
  });

  route("post", "/payments/:paymentId/documents", async (request, reply) => {
    const data = issueSchema.parse(request.body);

    return reply.status(201).send(
      ok(
        await invoicingService.issueForPayment(
          request.params.businessId,
          request.params.paymentId,
          { ...data, email: data.email || null }
        )
      )
    );
  });

  route("get", "/documents", async (request) => {
    const query = z
      .object({ month, kind: z.enum(["RECEIPT", "INVOICE"]).optional() })
      .parse(request.query ?? {});

    return ok(await invoicingService.list(request.params.businessId, query));
  });

  route("get", "/documents/export", async (request, reply) => {
    const query = z.object({ month }).parse(request.query ?? {});
    const csv = await invoicingService.exportCsv(request.params.businessId, query.month);

    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="documenten-${query.month}.csv"`)
      .send(csv);
  });

  route("get", "/documents/:documentId", async (request) =>
    ok(await invoicingService.get(request.params.businessId, request.params.documentId))
  );

  route("get", "/documents/:documentId/pdf", async (request, reply) => {
    const { number, buffer } = await invoicingService.pdf(
      request.params.businessId,
      request.params.documentId
    );

    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `inline; filename="${number}.pdf"`)
      .send(buffer);
  });

  route("get", "/documents/:documentId/ubl", async (request, reply) => {
    const { number, xml } = await invoicingService.ubl(
      request.params.businessId,
      request.params.documentId
    );

    return reply
      .header("Content-Type", "application/xml; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${number}.xml"`)
      .send(xml);
  });

  route("post", "/documents/:documentId/email", async (request) => {
    const { email } = z.object({ email: z.string().trim().email() }).parse(request.body);

    return ok(
      await invoicingService.email(request.params.businessId, request.params.documentId, email)
    );
  });

  route("post", "/documents/:documentId/convert", async (request, reply) => {
    const data = issueSchema.omit({ kind: true }).parse(request.body);

    return reply.status(201).send(
      ok(
        await invoicingService.convertToInvoice(
          request.params.businessId,
          request.params.documentId,
          { ...data, email: data.email || null }
        )
      )
    );
  });

  route("post", "/documents/:documentId/credit", async (request, reply) => {
    const data = z
      .object({ email: z.string().trim().email().optional().nullable() })
      .parse(request.body ?? {});

    return reply.status(201).send(
      ok(
        await invoicingService.creditInvoice(
          request.params.businessId,
          request.params.documentId,
          data
        )
      )
    );
  });
}
