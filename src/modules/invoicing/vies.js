import { compactVatNumber } from "./vat.js";

// ======================================================
// VIES
// ======================================================
//
// The EU's VAT register. Checks that a VAT number exists
// and returns the registered name and address, so the app
// can fill them in for an invoice.
//
// VIES is sometimes slow or down for a member state; the
// app then lets the owner type the details by hand.
// ======================================================

const URL =
  "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";

function clean(text) {
  const value = String(text ?? "").trim();

  return value && value !== "---" ? value : null;
}

/**
 * Belgian addresses come as "Kerkstraat 12\n9000 Gent".
 */
function splitAddress(address) {
  const lines = String(address ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const last = lines[lines.length - 1] ?? "";
  const match = last.match(/^(\d{4,5})\s+(.+)$/);

  if (match) {
    return {
      street: lines.slice(0, -1).join(", ") || null,
      postalCode: match[1],
      city: match[2],
    };
  }

  return { street: lines.join(", ") || null, postalCode: null, city: null };
}

export async function lookupVat(vatNumber) {
  const compact = compactVatNumber(vatNumber);

  if (!compact) {
    return { valid: false, reason: "FORMAT" };
  }

  try {
    const response = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        countryCode: compact.slice(0, 2),
        vatNumber: compact.slice(2),
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return { valid: null, reason: "UNAVAILABLE", vatNumber: compact };
    }

    const data = await response.json();

    if (data.userError && data.userError !== "VALID" && data.userError !== "INVALID") {
      return { valid: null, reason: "UNAVAILABLE", vatNumber: compact };
    }

    if (!data.valid) {
      return { valid: false, reason: "NOT_FOUND", vatNumber: compact };
    }

    return {
      valid: true,
      vatNumber: compact,
      name: clean(data.name),
      country: compact.slice(0, 2),
      ...splitAddress(clean(data.address)),
    };
  } catch {
    return { valid: null, reason: "UNAVAILABLE", vatNumber: compact };
  }
}
