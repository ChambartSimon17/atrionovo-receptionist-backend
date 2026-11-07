// ======================================================
// VAT
// ======================================================
//
// Prices in the app include VAT (what the customer pays).
// For a document the amounts are split per rate into the
// taxable base (maatstaf) and the VAT.
//
// The split is done on the total per rate, not per line,
// so the VAT on the document is exactly what Belgian
// rules expect: base × rate, rounded once.
//
// Pure: no database.
// ======================================================

/**
 * "BE 0712.345.678" -> { country: "BE", number: "0712345678" }
 * Returns null for text that is not a VAT number.
 */
export function parseVatNumber(text) {
  const compact = String(text ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  const match = compact.match(/^([A-Z]{2})([A-Z0-9]{2,12})$/);

  if (!match) {
    return null;
  }

  let [, country, number] = match;

  // Belgian numbers have 10 digits; old ones 9.
  if (country === "BE") {
    if (/^\d{9}$/.test(number)) {
      number = `0${number}`;
    }

    if (!/^[01]\d{9}$/.test(number)) {
      return null;
    }

    // Modulo-97 check of the Belgian enterprise number.
    const base = Number(number.slice(0, 8));
    const check = Number(number.slice(8));

    if (97 - (base % 97) !== check) {
      return null;
    }
  }

  return { country, number };
}

/**
 * "BE0712345678" -> "BE 0712.345.678"
 */
export function formatVatNumber(text) {
  const parsed = parseVatNumber(text);

  if (!parsed) {
    return text ?? "";
  }

  if (parsed.country === "BE") {
    const n = parsed.number;

    return `BE ${n.slice(0, 4)}.${n.slice(4, 7)}.${n.slice(7)}`;
  }

  return `${parsed.country} ${parsed.number}`;
}

export function compactVatNumber(text) {
  const parsed = parseVatNumber(text);

  return parsed ? `${parsed.country}${parsed.number}` : null;
}

/**
 * Totals of document lines.
 *
 * lines: [{ name, quantity, unitCents, vatRate }]
 *   unitCents includes VAT.
 *
 * Returns { netCents, vatCents, grossCents, rates }
 *   rates: [{ rate, baseCents, vatCents, grossCents }]
 */
export function computeTotals(lines) {
  const byRate = new Map();

  for (const line of lines) {
    const gross = line.unitCents * line.quantity;

    byRate.set(line.vatRate, (byRate.get(line.vatRate) ?? 0) + gross);
  }

  const rates = [...byRate.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, grossCents]) => {
      const baseCents = Math.round((grossCents * 100) / (100 + rate));

      return {
        rate,
        baseCents,
        vatCents: grossCents - baseCents,
        grossCents,
      };
    });

  return {
    netCents: rates.reduce((sum, item) => sum + item.baseCents, 0),
    vatCents: rates.reduce((sum, item) => sum + item.vatCents, 0),
    grossCents: rates.reduce((sum, item) => sum + item.grossCents, 0),
    rates,
  };
}

/**
 * The amount of one line without VAT, for showing on the
 * document (the totals come from computeTotals).
 */
export function lineNetCents(line) {
  return Math.round(
    (line.unitCents * line.quantity * 100) / (100 + line.vatRate)
  );
}
