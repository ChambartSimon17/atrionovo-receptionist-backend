import { computeTotals, compactVatNumber, lineNetCents } from "./vat.js";
import { EXEMPTION_TEXT } from "./pdf.js";

// ======================================================
// UBL (Peppol BIS Billing 3.0)
// ======================================================
//
// The structured e-invoice that Belgian VAT-registered
// businesses must send each other over Peppol since
// 1 January 2026. The Peppol provider takes this XML and
// delivers it to the buyer's accounting software.
//
// Belgian parties are identified by their enterprise
// number (scheme 0208 = the VAT number without "BE").
// ======================================================

function xml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function amount(cents) {
  return (cents / 100).toFixed(2);
}

function isoDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function endpoint(party) {
  const vat = compactVatNumber(party.vatNumber);

  // Peppol is only used between Belgian businesses here.
  return vat?.startsWith("BE")
    ? `<cbc:EndpointID schemeID="0208">${vat.slice(2)}</cbc:EndpointID>`
    : "";
}

function party(partyData, tag) {
  const vat = compactVatNumber(partyData.vatNumber);

  return `<cac:${tag}><cac:Party>
${endpoint(partyData)}
<cac:PartyName><cbc:Name>${xml(partyData.tradeName || partyData.name)}</cbc:Name></cac:PartyName>
<cac:PostalAddress>
<cbc:StreetName>${xml(partyData.street)}</cbc:StreetName>
<cbc:CityName>${xml(partyData.city)}</cbc:CityName>
<cbc:PostalZone>${xml(partyData.postalCode)}</cbc:PostalZone>
<cac:Country><cbc:IdentificationCode>${xml(partyData.country || "BE")}</cbc:IdentificationCode></cac:Country>
</cac:PostalAddress>
${vat ? `<cac:PartyTaxScheme><cbc:CompanyID>${vat}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ""}
<cac:PartyLegalEntity><cbc:RegistrationName>${xml(partyData.name)}</cbc:RegistrationName>${vat?.startsWith("BE") ? `<cbc:CompanyID schemeID="0208">${vat.slice(2)}</cbc:CompanyID>` : ""}</cac:PartyLegalEntity>
</cac:Party></cac:${tag}>`;
}

/**
 * The UBL XML of an invoice or credit note.
 */
export function renderUbl(doc, { relatedNumber } = {}) {
  const credit = doc.kind === "CREDIT_NOTE";
  const root = credit ? "CreditNote" : "Invoice";
  const seller = doc.seller;
  const exempt = seller.vatExempt;
  const totals = computeTotals(doc.lines);

  const category = (rate) => (exempt ? "E" : rate === 0 ? "Z" : "S");

  const taxSubtotals = totals.rates
    .map(
      (rate) => `<cac:TaxSubtotal>
<cbc:TaxableAmount currencyID="EUR">${amount(exempt ? rate.grossCents : rate.baseCents)}</cbc:TaxableAmount>
<cbc:TaxAmount currencyID="EUR">${amount(exempt ? 0 : rate.vatCents)}</cbc:TaxAmount>
<cac:TaxCategory><cbc:ID>${category(rate.rate)}</cbc:ID><cbc:Percent>${exempt ? 0 : rate.rate}</cbc:Percent>${exempt ? `<cbc:TaxExemptionReason>${xml(EXEMPTION_TEXT)}</cbc:TaxExemptionReason>` : ""}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
</cac:TaxSubtotal>`
    )
    .join("\n");

  const lines = doc.lines
    .map((line, index) => {
      const net = exempt ? line.unitCents * line.quantity : lineNetCents(line);
      const unit = exempt ? line.unitCents : Math.round((line.unitCents * 100) / (100 + line.vatRate));
      const quantityTag = credit ? "CreditedQuantity" : "InvoicedQuantity";

      return `<cac:${root}Line>
<cbc:ID>${index + 1}</cbc:ID>
<cbc:${quantityTag} unitCode="C62">${line.quantity}</cbc:${quantityTag}>
<cbc:LineExtensionAmount currencyID="EUR">${amount(net)}</cbc:LineExtensionAmount>
<cac:Item><cbc:Name>${xml(line.name)}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>${category(line.vatRate)}</cbc:ID><cbc:Percent>${exempt ? 0 : line.vatRate}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
<cac:Price><cbc:PriceAmount currencyID="EUR">${amount(unit)}</cbc:PriceAmount></cac:Price>
</cac:${root}Line>`;
    })
    .join("\n");

  const lineTotal = exempt ? totals.grossCents : totals.netCents;
  const vatTotal = exempt ? 0 : totals.vatCents;
  const paid = credit ? 0 : totals.grossCents;

  return `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
<cbc:ID>${xml(doc.number)}</cbc:ID>
<cbc:IssueDate>${isoDate(doc.issuedAt)}</cbc:IssueDate>
<cbc:${credit ? "CreditNoteTypeCode" : "InvoiceTypeCode"}>${credit ? 381 : 380}</cbc:${credit ? "CreditNoteTypeCode" : "InvoiceTypeCode"}>
<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
<cbc:BuyerReference>${xml(doc.number)}</cbc:BuyerReference>
${relatedNumber ? `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${xml(relatedNumber)}</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>` : ""}
${party(seller, "AccountingSupplierParty")}
${party(doc.buyer, "AccountingCustomerParty")}
<cac:Delivery><cbc:ActualDeliveryDate>${isoDate(doc.serviceDate)}</cbc:ActualDeliveryDate></cac:Delivery>
${seller.iban ? `<cac:PaymentMeans><cbc:PaymentMeansCode>${doc.paymentMethod === "CASH" ? 10 : 48}</cbc:PaymentMeansCode><cac:PayeeFinancialAccount><cbc:ID>${xml(seller.iban.replace(/\s/g, ""))}</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>` : ""}
<cac:TaxTotal>
<cbc:TaxAmount currencyID="EUR">${amount(vatTotal)}</cbc:TaxAmount>
${taxSubtotals}
</cac:TaxTotal>
<cac:LegalMonetaryTotal>
<cbc:LineExtensionAmount currencyID="EUR">${amount(lineTotal)}</cbc:LineExtensionAmount>
<cbc:TaxExclusiveAmount currencyID="EUR">${amount(lineTotal)}</cbc:TaxExclusiveAmount>
<cbc:TaxInclusiveAmount currencyID="EUR">${amount(totals.grossCents)}</cbc:TaxInclusiveAmount>
<cbc:PrepaidAmount currencyID="EUR">${amount(paid)}</cbc:PrepaidAmount>
<cbc:PayableAmount currencyID="EUR">${amount(totals.grossCents - paid)}</cbc:PayableAmount>
</cac:LegalMonetaryTotal>
${lines}
</${root}>
`;
}
