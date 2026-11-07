import PDFDocument from "pdfkit";
import { DateTime } from "luxon";

import { computeTotals, formatVatNumber, lineNetCents } from "./vat.js";

// ======================================================
// PDF of a receipt, invoice or credit note
// ======================================================
//
// An A4 page with everything a Belgian invoice must
// state: seller and buyer with address and VAT number, a
// unique number, the dates, a description per line, the
// taxable base and VAT per rate, the total, and the
// exemption mention when the seller is exempt.
//
// A receipt (kasticket) is the same page without a buyer.
// ======================================================

const GREEN = "#1F5F55";
const MUTED = "#5B6661";
const LINE = "#E4E0D8";

export const EXEMPTION_TEXT =
  "Bijzondere vrijstellingsregeling kleine ondernemingen. Btw niet van toepassing (art. 56bis WBTW).";

const TITLES = {
  RECEIPT: "KASTICKET",
  INVOICE: "FACTUUR",
  CREDIT_NOTE: "CREDITNOTA",
};

const METHODS = {
  CASH: "contant",
  CARD_TERMINAL: "kaart",
  STRIPE_LINK: "online (QR-code)",
};

export function euro(cents) {
  const sign = cents < 0 ? "-" : "";
  const value = Math.abs(cents) / 100;

  return `${sign}€ ${value.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

function date(value, timezone) {
  return DateTime.fromJSDate(new Date(value), { zone: timezone })
    .setLocale("nl-BE")
    .toFormat("d LLLL yyyy");
}

function partyLines(party) {
  return [
    party.name,
    party.street,
    [party.postalCode, party.city].filter(Boolean).join(" "),
    party.country && party.country !== "BE" ? party.country : null,
    party.vatNumber ? `Btw ${formatVatNumber(party.vatNumber)}` : null,
  ].filter(Boolean);
}

/**
 * Builds the PDF and returns it as a Buffer.
 *
 * doc: a SalesDocument row (seller, buyer, lines… as JSON)
 */
export function renderDocumentPdf(doc, { timezone = "Europe/Brussels", relatedNumber } = {}) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: "A4", margin: 48, info: { Title: doc.number } });
    const chunks = [];

    pdf.on("data", (chunk) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    const seller = doc.seller;
    const buyer = doc.buyer;
    const lines = doc.lines;
    const sign = doc.kind === "CREDIT_NOTE" ? -1 : 1;
    const totals = computeTotals(lines);
    const left = 48;
    const right = 547;

    // Seller and title

    pdf.fillColor(GREEN).font("Helvetica-Bold").fontSize(18).text(seller.tradeName || seller.name, left, 48);
    pdf.fillColor("#1C2421").font("Helvetica").fontSize(9.5);
    pdf.text(partyLines(seller).join("\n"), left, 74, { width: 260 });

    if (seller.iban) {
      pdf.text(`IBAN ${seller.iban}`, { width: 260 });
    }

    pdf.font("Helvetica-Bold").fontSize(18).text(TITLES[doc.kind], 300, 48, { width: right - 300, align: "right" });
    pdf.font("Helvetica").fontSize(9.5).fillColor("#1C2421");

    const meta = [
      `Nummer ${doc.number}`,
      `Datum ${date(doc.issuedAt, timezone)}`,
      doc.kind !== "CREDIT_NOTE" ? `Datum dienst ${date(doc.serviceDate, timezone)}` : null,
      relatedNumber
        ? doc.kind === "CREDIT_NOTE"
          ? `Op factuur ${relatedNumber}`
          : `Vervangt kasticket ${relatedNumber}`
        : null,
    ].filter(Boolean);

    pdf.text(meta.join("\n"), 300, 74, { width: right - 300, align: "right" });

    let y = 160;

    // Buyer

    if (buyer) {
      pdf.roundedRect(left, y, 260, 16 + partyLines(buyer).length * 12, 4).fill("#F6F4EF");
      pdf.fillColor(MUTED).fontSize(8).font("Helvetica-Bold").text(
        doc.kind === "CREDIT_NOTE" ? "CREDITNOTA AAN" : "FACTUUR AAN",
        left + 10,
        y + 8
      );
      pdf.fillColor("#1C2421").font("Helvetica").fontSize(9.5).text(partyLines(buyer).join("\n"), left + 10, y + 20, { width: 240 });
      y += 30 + partyLines(buyer).length * 12;
    }

    // Lines

    y += 10;

    const columns = [
      { label: "Omschrijving", x: left, width: 220, align: "left" },
      { label: "Aantal", x: 270, width: 45, align: "right" },
      { label: "Prijs excl.", x: 320, width: 75, align: "right" },
      { label: "Btw", x: 400, width: 45, align: "right" },
      { label: "Totaal excl.", x: 450, width: right - 450, align: "right" },
    ];

    pdf.fillColor(MUTED).font("Helvetica-Bold").fontSize(8);

    for (const column of columns) {
      pdf.text(column.label.toUpperCase(), column.x, y, { width: column.width, align: column.align });
    }

    y += 14;
    pdf.moveTo(left, y).lineTo(right, y).strokeColor(LINE).stroke();
    y += 6;

    pdf.fillColor("#1C2421").font("Helvetica").fontSize(9.5);

    for (const line of lines) {
      const net = lineNetCents(line) * sign;
      const unitNet = Math.round((line.unitCents * 100) / (100 + line.vatRate)) * sign;

      const values = [
        line.name,
        String(line.quantity),
        euro(unitNet),
        seller.vatExempt ? "-" : `${line.vatRate}%`,
        euro(net),
      ];

      const height = pdf.heightOfString(line.name, { width: 220 });

      columns.forEach((column, index) => {
        pdf.text(values[index], column.x, y, { width: column.width, align: column.align });
      });

      y += Math.max(height, 12) + 6;
      pdf.moveTo(left, y - 3).lineTo(right, y - 3).strokeColor("#EFECE6").stroke();
    }

    // Totals

    y += 8;

    const totalRows = seller.vatExempt
      ? [["Totaal", euro(totals.grossCents * sign), true]]
      : [
          ...totals.rates.flatMap((rate) => [
            [`Maatstaf ${rate.rate}%`, euro(rate.baseCents * sign)],
            [`Btw ${rate.rate}%`, euro(rate.vatCents * sign)],
          ]),
          ["Totaal", euro(totals.grossCents * sign), true],
        ];

    if (doc.kind === "RECEIPT" && doc.tipCents > 0) {
      totalRows.push(["Fooi (geen btw)", euro(doc.tipCents)]);
      totalRows.push(["Betaald", euro(totals.grossCents + doc.tipCents), true]);
    }

    for (const [label, value, strong] of totalRows) {
      pdf.font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(strong ? 11 : 9.5);
      pdf.text(label, 330, y, { width: 120 });
      pdf.text(value, 450, y, { width: right - 450, align: "right" });
      y += strong ? 18 : 14;
    }

    y += 10;

    if (seller.vatExempt) {
      pdf.font("Helvetica").fontSize(9).fillColor("#1C2421").text(EXEMPTION_TEXT, left, y, { width: right - left });
      y += 24;
    }

    if (doc.kind !== "CREDIT_NOTE" && doc.paymentMethod) {
      pdf.roundedRect(left, y, right - left, 24, 4).fill("#F3F8F6");
      pdf.fillColor(GREEN).font("Helvetica-Bold").fontSize(9.5).text(
        `Betaald op ${date(doc.serviceDate, timezone)} (${METHODS[doc.paymentMethod] ?? doc.paymentMethod})`,
        left + 10,
        y + 7
      );
      y += 34;
    }

    if (doc.kind === "INVOICE" && doc.tipCents > 0) {
      pdf.fillColor(MUTED).font("Helvetica").fontSize(8.5).text(
        `Een fooi van ${euro(doc.tipCents)} voor de therapeut staat niet op deze factuur.`,
        left,
        y
      );
    }

    // The footer sits in the bottom margin; without this
    // pdfkit would start a second page for it.
    pdf.page.margins.bottom = 0;

    pdf.fillColor(MUTED).font("Helvetica").fontSize(8).text(
      `${doc.number} · opgemaakt met AtrioNovo voor ${seller.name}`,
      left,
      790,
      { width: right - left, align: "center" }
    );

    pdf.end();
  });
}
