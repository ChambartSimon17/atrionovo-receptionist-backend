import { DateTime } from "luxon";
import { Prisma } from "@prisma/client";

import prisma from "../../db/prisma.js";
import env from "../../config/env.js";
import businessRepository from "../business/business.repository.js";
import AppError from "../../errors/AppError.js";
import NotFoundError from "../../errors/NotFoundError.js";
import ValidationError from "../../errors/ValidationError.js";
import { ErrorCodes } from "../../errors/error-codes.js";
import { computeTotals, compactVatNumber, formatVatNumber, parseVatNumber } from "./vat.js";
import { lookupVat } from "./vies.js";
import { euro, renderDocumentPdf } from "./pdf.js";
import { renderUbl } from "./ubl.js";
import { mailConfigured, sendMail } from "./mailer.js";

// ======================================================
// Invoicing
// ======================================================
//
// Receipts (kasticket), invoices (factuur) and credit
// notes (creditnota) for the payments of a business.
//
// - Each business invoices in its own name, with its own
//   details (Meer → Facturatie).
// - Numbers: T/F/C + year + a gapless sequence per kind,
//   taken inside a SERIALIZABLE transaction.
// - Documents are never edited or deleted. An invoice is
//   cancelled with a credit note; a receipt can be turned
//   into an invoice within the same month.
// - An invoice to a Belgian VAT-registered buyer goes over
//   Peppol (when the provider is set up); every document
//   can be mailed as a PDF.
// ======================================================

const PREFIX = { RECEIPT: "T", INVOICE: "F", CREDIT_NOTE: "C" };

function appError(message, code, statusCode = 400) {
  const error = new AppError(message, statusCode);

  error.code = code;

  return error;
}

export function documentDto(doc, related) {
  return {
    id: doc.id,
    kind: doc.kind,
    number: doc.number,
    issuedAt: doc.issuedAt.toISOString(),
    serviceDate: doc.serviceDate.toISOString(),
    buyer: doc.buyer,
    lines: doc.lines,
    netCents: doc.netCents,
    vatCents: doc.vatCents,
    grossCents: doc.grossCents,
    tipCents: doc.tipCents,
    paymentId: doc.paymentId,
    paymentMethod: doc.paymentMethod,
    relatedDocumentId: doc.relatedDocumentId,
    relatedNumber: related?.number ?? null,
    emailTo: doc.emailTo,
    emailedAt: doc.emailedAt?.toISOString() ?? null,
    emailError: doc.emailError,
    peppolStatus: doc.peppolStatus,
    peppolError: doc.peppolError,
  };
}

function settingsDto(business) {
  return {
    legalName: business.invoiceLegalName ?? "",
    vatNumber: business.invoiceVatNumber ? formatVatNumber(business.invoiceVatNumber) : "",
    street: business.invoiceStreet ?? "",
    postalCode: business.invoicePostalCode ?? "",
    city: business.invoiceCity ?? "",
    country: business.invoiceCountry ?? "BE",
    iban: business.invoiceIban ?? "",
    email: business.invoiceEmail ?? "",
    vatExempt: business.vatExempt,
    vatRate: business.vatRate,
    complete: isComplete(business),
    mailConfigured: mailConfigured(),
    peppolConfigured: Boolean(env.einvoiceApiKey),
  };
}

function isComplete(business) {
  return Boolean(
    business.invoiceLegalName &&
      business.invoiceStreet &&
      business.invoicePostalCode &&
      business.invoiceCity &&
      (business.vatExempt || business.invoiceVatNumber)
  );
}

function sellerOf(business) {
  return {
    name: business.invoiceLegalName,
    tradeName: business.name,
    vatNumber: business.invoiceVatNumber,
    street: business.invoiceStreet,
    postalCode: business.invoicePostalCode,
    city: business.invoiceCity,
    country: business.invoiceCountry || "BE",
    iban: business.invoiceIban,
    vatExempt: business.vatExempt,
  };
}

function buyerOf(input) {
  const vat = input.vatNumber ? compactVatNumber(input.vatNumber) : null;

  if (input.vatNumber && !vat) {
    throw new ValidationError("This VAT number is not valid.", ErrorCodes.VAT_NUMBER_INVALID);
  }

  return {
    name: input.name.trim(),
    vatNumber: vat,
    street: input.street?.trim() || null,
    postalCode: input.postalCode?.trim() || null,
    city: input.city?.trim() || null,
    country: (input.country || vat?.slice(0, 2) || "BE").toUpperCase(),
  };
}

/**
 * Whether an invoice must go over Peppol: a Belgian
 * VAT-registered seller invoicing a Belgian
 * VAT-registered buyer.
 */
function needsPeppol(seller, buyer) {
  return Boolean(
    !seller.vatExempt &&
      seller.vatNumber?.startsWith("BE") &&
      buyer?.vatNumber?.startsWith("BE")
  );
}

class InvoicingService {
  // ----------------------------------------------------
  // Settings
  // ----------------------------------------------------

  async getSettings(businessId) {
    return settingsDto(await this.#business(businessId));
  }

  async updateSettings(businessId, data) {
    let vatNumber = null;

    if (data.vatNumber) {
      vatNumber = compactVatNumber(data.vatNumber);

      if (!vatNumber) {
        throw new ValidationError("This VAT number is not valid.", ErrorCodes.VAT_NUMBER_INVALID);
      }
    }

    const business = await prisma.business.update({
      where: { id: businessId },
      data: {
        invoiceLegalName: data.legalName?.trim() || null,
        invoiceVatNumber: vatNumber,
        invoiceStreet: data.street?.trim() || null,
        invoicePostalCode: data.postalCode?.trim() || null,
        invoiceCity: data.city?.trim() || null,
        invoiceCountry: (data.country || "BE").toUpperCase(),
        invoiceIban: data.iban?.replace(/\s+/g, " ").trim().toUpperCase() || null,
        invoiceEmail: data.email?.trim() || null,
        vatExempt: Boolean(data.vatExempt),
        vatRate: data.vatRate ?? 21,
      },
    });

    return settingsDto(business);
  }

  async lookup(vatNumber) {
    if (!parseVatNumber(vatNumber)) {
      return { valid: false, reason: "FORMAT" };
    }

    const result = await lookupVat(vatNumber);

    return result.vatNumber
      ? { ...result, vatNumber: formatVatNumber(result.vatNumber) }
      : result;
  }

  // ----------------------------------------------------
  // Issuing
  // ----------------------------------------------------

  /**
   * POST /payments/:paymentId/documents
   * { kind: RECEIPT | INVOICE, email?, buyer?, saveToCustomer? }
   */
  async issueForPayment(businessId, paymentId, data) {
    const business = await this.#business(businessId);

    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, businessId },
      include: {
        appointment: { select: { customerId: true, startTime: true } },
        documents: { where: { kind: { in: ["RECEIPT", "INVOICE"] } } },
      },
    });

    if (!payment) {
      throw new NotFoundError("Payment not found.", ErrorCodes.PAYMENT_NOT_FOUND);
    }

    if (payment.status !== "PAID") {
      throw new ValidationError("Only paid payments get a receipt or invoice.", ErrorCodes.VALIDATION_ERROR);
    }

    const existingInvoice = payment.documents.find((doc) => doc.kind === "INVOICE");

    if (existingInvoice) {
      throw appError("This payment already has an invoice.", ErrorCodes.DOCUMENT_EXISTS, 409);
    }

    if (data.kind === "RECEIPT") {
      const existing = payment.documents.find((doc) => doc.kind === "RECEIPT");

      if (existing) {
        // A second request mails the same receipt again.
        return data.email ? this.email(businessId, existing.id, data.email) : this.#dto(existing);
      }
    }

    if (!isComplete(business)) {
      throw appError(
        "Fill in the business details under Facturatie first.",
        ErrorCodes.INVOICING_NOT_SET_UP
      );
    }

    const buyer = data.kind === "INVOICE" ? buyerOf(data.buyer ?? {}) : null;

    if (data.kind === "INVOICE" && (!buyer.name || !buyer.street || !buyer.city)) {
      throw new ValidationError("An invoice needs the customer's name and address.", ErrorCodes.VALIDATION_ERROR);
    }

    const customerId = payment.appointment?.customerId ?? null;

    if (data.kind === "INVOICE" && data.saveToCustomer && customerId) {
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          billingName: buyer.name,
          billingVatNumber: buyer.vatNumber,
          billingStreet: buyer.street,
          billingPostalCode: buyer.postalCode,
          billingCity: buyer.city,
          billingCountry: buyer.country,
          billingEmail: data.email || null,
        },
      });
    }

    // The receipt this invoice replaces, if any.
    const receipt = payment.documents.find((doc) => doc.kind === "RECEIPT");

    const doc = await this.#create({
      business,
      kind: data.kind,
      paymentId: payment.id,
      customerId,
      buyer,
      lines: payment.items.map((item) => ({
        name: item.name,
        quantity: 1,
        unitCents: item.amountCents,
        vatRate: business.vatExempt ? 0 : business.vatRate,
      })),
      tipCents: payment.tipCents,
      paymentMethod: payment.method,
      serviceDate: payment.appointment?.startTime ?? payment.paidAt ?? new Date(),
      relatedDocumentId: data.kind === "INVOICE" ? receipt?.id ?? null : null,
    });

    return this.#deliver(business, doc, data.email);
  }

  /**
   * POST /documents/:id/convert
   * A receipt becomes an invoice (the customer asks for
   * one afterwards). Allowed until the end of the month.
   */
  async convertToInvoice(businessId, documentId, data) {
    const receipt = await this.#document(businessId, documentId);

    if (receipt.kind !== "RECEIPT" || !receipt.paymentId) {
      throw new ValidationError("Only a receipt can be turned into an invoice.", ErrorCodes.VALIDATION_ERROR);
    }

    const business = await this.#business(businessId);
    const zone = business.timezone;

    const month = DateTime.fromJSDate(receipt.issuedAt, { zone }).toFormat("yyyy-LL");
    const now = DateTime.now().setZone(zone).toFormat("yyyy-LL");

    if (month !== now) {
      throw appError(
        "A receipt can only be turned into an invoice in the same month.",
        ErrorCodes.DOCUMENT_TOO_OLD
      );
    }

    return this.issueForPayment(businessId, receipt.paymentId, { ...data, kind: "INVOICE" });
  }

  /**
   * POST /documents/:id/credit
   * A credit note for the full invoice.
   */
  async creditInvoice(businessId, documentId, { email } = {}) {
    const invoice = await this.#document(businessId, documentId);

    if (invoice.kind !== "INVOICE") {
      throw new ValidationError("Only an invoice can be credited.", ErrorCodes.VALIDATION_ERROR);
    }

    const existing = await prisma.salesDocument.findFirst({
      where: { businessId, kind: "CREDIT_NOTE", relatedDocumentId: invoice.id },
    });

    if (existing) {
      throw appError("This invoice has already been credited.", ErrorCodes.DOCUMENT_EXISTS, 409);
    }

    const business = await this.#business(businessId);

    const doc = await this.#create({
      business,
      kind: "CREDIT_NOTE",
      paymentId: invoice.paymentId,
      customerId: invoice.customerId,
      buyer: invoice.buyer,
      // The credit note repeats the invoice's seller and
      // lines, so it matches it exactly.
      seller: invoice.seller,
      lines: invoice.lines,
      tipCents: 0,
      paymentMethod: null,
      serviceDate: invoice.serviceDate,
      relatedDocumentId: invoice.id,
    });

    return this.#deliver(business, doc, email ?? invoice.emailTo);
  }

  // ----------------------------------------------------
  // Reading, mailing
  // ----------------------------------------------------

  async list(businessId, { month, kind }) {
    const business = await this.#business(businessId);
    const start = DateTime.fromISO(`${month}-01`, { zone: business.timezone });

    const docs = await prisma.salesDocument.findMany({
      where: {
        businessId,
        ...(kind === "RECEIPT"
          ? { kind: "RECEIPT" }
          : kind === "INVOICE"
            ? { kind: { in: ["INVOICE", "CREDIT_NOTE"] } }
            : {}),
        issuedAt: { gte: start.toJSDate(), lt: start.plus({ months: 1 }).toJSDate() },
      },
      orderBy: [{ issuedAt: "desc" }],
    });

    const relatedIds = docs.map((doc) => doc.relatedDocumentId).filter(Boolean);

    const related = await prisma.salesDocument.findMany({
      where: { id: { in: relatedIds } },
      select: { id: true, number: true },
    });

    // Which receipts were turned into an invoice, which
    // invoices were credited.
    const replacedOrCredited = await prisma.salesDocument.findMany({
      where: { relatedDocumentId: { in: docs.map((doc) => doc.id) } },
      select: { relatedDocumentId: true, number: true, kind: true },
    });

    return docs.map((doc) => ({
      ...documentDto(doc, related.find((item) => item.id === doc.relatedDocumentId)),
      followedBy:
        replacedOrCredited.find((item) => item.relatedDocumentId === doc.id)?.number ?? null,
    }));
  }

  async get(businessId, documentId) {
    return this.#dto(await this.#document(businessId, documentId));
  }

  async pdf(businessId, documentId) {
    const doc = await this.#document(businessId, documentId);
    const business = await this.#business(businessId);

    return {
      number: doc.number,
      buffer: await renderDocumentPdf(doc, {
        timezone: business.timezone,
        relatedNumber: await this.#relatedNumber(doc),
      }),
    };
  }

  async ubl(businessId, documentId) {
    const doc = await this.#document(businessId, documentId);

    if (doc.kind === "RECEIPT") {
      throw new ValidationError("A receipt has no e-invoice.", ErrorCodes.VALIDATION_ERROR);
    }

    return { number: doc.number, xml: renderUbl(doc, { relatedNumber: await this.#relatedNumber(doc) }) };
  }

  /**
   * POST /documents/:id/email { email }
   */
  async email(businessId, documentId, email) {
    const business = await this.#business(businessId);
    const doc = await this.#document(businessId, documentId);

    return this.#mail(business, doc, email);
  }

  /**
   * GET /documents/export?month — one line per document,
   * for the accountant.
   */
  async exportCsv(businessId, month) {
    const docs = await this.list(businessId, { month });
    const kinds = { RECEIPT: "Kasticket", INVOICE: "Factuur", CREDIT_NOTE: "Creditnota" };
    const amount = (cents) => (cents / 100).toFixed(2).replace(".", ",");

    const rows = [...docs]
      .sort((a, b) => a.number.localeCompare(b.number))
      .map((doc) => {
        const sign = doc.kind === "CREDIT_NOTE" ? -1 : 1;

        return [
          kinds[doc.kind],
          doc.number,
          doc.issuedAt.slice(0, 10),
          `"${(doc.buyer?.name ?? "").replaceAll('"', '""')}"`,
          doc.buyer?.vatNumber ?? "",
          amount(doc.netCents * sign),
          amount(doc.vatCents * sign),
          amount(doc.grossCents * sign),
          amount(doc.tipCents),
          doc.paymentMethod ?? "",
          doc.relatedNumber ?? "",
        ].join(";");
      });

    return [
      "Soort;Nummer;Datum;Klant;Btw-nummer klant;Excl. btw;Btw;Totaal;Fooi;Betaalwijze;Verwijst naar",
      ...rows,
    ].join("\n");
  }

  // ----------------------------------------------------
  // Internals
  // ----------------------------------------------------

  async #create({ business, kind, seller, ...rest }) {
    const totals = computeTotals(rest.lines);
    const year = DateTime.now().setZone(business.timezone).year;

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await prisma.$transaction(
          async (tx) => {
            const last = await tx.salesDocument.findFirst({
              where: { businessId: business.id, kind, year },
              orderBy: { sequence: "desc" },
              select: { sequence: true },
            });

            const sequence = (last?.sequence ?? 0) + 1;

            return tx.salesDocument.create({
              data: {
                businessId: business.id,
                kind,
                year,
                sequence,
                number: `${PREFIX[kind]}${year}-${String(sequence).padStart(4, "0")}`,
                seller: seller ?? sellerOf(business),
                buyer: rest.buyer ?? Prisma.JsonNull,
                lines: rest.lines,
                netCents: totals.netCents,
                vatCents: totals.vatCents,
                grossCents: totals.grossCents,
                tipCents: rest.tipCents ?? 0,
                paymentId: rest.paymentId ?? null,
                customerId: rest.customerId ?? null,
                paymentMethod: rest.paymentMethod ?? null,
                serviceDate: rest.serviceDate,
                relatedDocumentId: rest.relatedDocumentId ?? null,
                peppolStatus:
                  kind !== "RECEIPT" && needsPeppol(seller ?? sellerOf(business), rest.buyer)
                    ? "PENDING"
                    : "NOT_REQUIRED",
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
      } catch (error) {
        const retry =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2002" || error.code === "P2034");

        if (!retry || attempt === 4) {
          throw error;
        }
      }
    }

    throw new Error("Could not number the document.");
  }

  async #deliver(business, doc, email) {
    let current = doc;

    if (current.peppolStatus === "PENDING") {
      current = await this.#sendPeppol(current);
    }

    if (email) {
      return this.#mail(business, current, email);
    }

    return this.#dto(current);
  }

  async #sendPeppol(doc) {
    if (!env.einvoiceApiKey) {
      return prisma.salesDocument.update({
        where: { id: doc.id },
        data: {
          peppolStatus: "NOT_CONFIGURED",
          peppolError: "Peppol is not set up on the server yet.",
        },
      });
    }

    // The e-invoice.be connection is added once the API
    // key is available; until then the document waits.
    return prisma.salesDocument.update({
      where: { id: doc.id },
      data: { peppolStatus: "PENDING" },
    });
  }

  async #mail(business, doc, email) {
    const to = String(email ?? "").trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      throw new ValidationError("This e-mail address is not valid.", ErrorCodes.VALIDATION_ERROR);
    }

    const titles = { RECEIPT: "Kasticket", INVOICE: "Factuur", CREDIT_NOTE: "Creditnota" };
    const title = titles[doc.kind];
    const name = business.name;

    try {
      const pdf = await renderDocumentPdf(doc, {
        timezone: business.timezone,
        relatedNumber: await this.#relatedNumber(doc),
      });

      const attachments = [{ filename: `${doc.number}.pdf`, content: pdf }];

      if (doc.kind !== "RECEIPT") {
        attachments.push({
          filename: `${doc.number}.xml`,
          content: Buffer.from(renderUbl(doc, { relatedNumber: await this.#relatedNumber(doc) })),
        });
      }

      const text = [
        "Beste klant,",
        "",
        `In de bijlage vind je ${title.toLowerCase()} ${doc.number} van ${name} (${euro(doc.grossCents)}).`,
        doc.peppolStatus === "SENT" || doc.peppolStatus === "DELIVERED"
          ? "De factuur is ook via Peppol naar je boekhouding verstuurd. Deze mail is een kopie."
          : null,
        "",
        "Bedankt voor je bezoek en tot een volgende keer!",
        name,
      ]
        .filter((line) => line !== null)
        .join("\n");

      await sendMail({
        fromName: name,
        replyTo: business.invoiceEmail || undefined,
        to,
        subject: `${title} ${doc.number} van ${name}`,
        text,
        attachments,
      });

      const updated = await prisma.salesDocument.update({
        where: { id: doc.id },
        data: { emailTo: to, emailedAt: new Date(), emailError: null },
      });

      return this.#dto(updated);
    } catch (error) {
      const updated = await prisma.salesDocument.update({
        where: { id: doc.id },
        data: { emailTo: to, emailError: error.message.slice(0, 300) },
      });

      // The document exists; the app shows that the mail
      // did not leave and offers to try again.
      return this.#dto(updated);
    }
  }

  async #relatedNumber(doc) {
    if (!doc.relatedDocumentId) {
      return null;
    }

    const related = await prisma.salesDocument.findUnique({
      where: { id: doc.relatedDocumentId },
      select: { number: true },
    });

    return related?.number ?? null;
  }

  async #dto(doc) {
    const related = doc.relatedDocumentId
      ? await prisma.salesDocument.findUnique({
          where: { id: doc.relatedDocumentId },
          select: { number: true },
        })
      : null;

    return documentDto(doc, related);
  }

  async #document(businessId, documentId) {
    const doc = await prisma.salesDocument.findFirst({ where: { id: documentId, businessId } });

    if (!doc) {
      throw new NotFoundError("Document not found.", ErrorCodes.DOCUMENT_NOT_FOUND);
    }

    return doc;
  }

  async #business(businessId) {
    const business = await businessRepository.findById(businessId);

    if (!business) {
      throw new NotFoundError("Business not found.", ErrorCodes.BUSINESS_NOT_FOUND);
    }

    return business;
  }
}

export default new InvoicingService();
