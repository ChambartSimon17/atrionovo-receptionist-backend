import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ======================================================
// Vapi Config
// ======================================================
//
// vapi/config.json in the repository root: the shared
// assistant settings (voice, model, transcriber), also used
// by `npm run vapi:sync`.
// ======================================================

export const REPO_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

const vapiConfig = JSON.parse(
  readFileSync(join(REPO_ROOT, "vapi/config.json"), "utf8")
);

export default vapiConfig;

// Deepgram keyterm prompting has a limited budget (about
// 500 tokens per request). Keep well under it, so a long
// list never makes the transcriber refuse the call.
export const MAX_KEYTERMS = 100;
export const MAX_KEYTERM_CHARACTERS = 2000;

/**
 * Cleaned keyterms: trimmed, no duplicates, within limits.
 * Every entry stays one term (names like "Nek-, Schouder-
 * en Rugmassage" contain commas, so entries are never
 * split).
 */
export function cleanKeyterms(keyterms) {
  const result = [];
  let characters = 0;

  for (const raw of keyterms ?? []) {
    const term = String(raw).replace(/\s+/g, " ").trim();

    if (!term || result.some((t) => t.toLowerCase() === term.toLowerCase())) {
      continue;
    }

    if (
      result.length >= MAX_KEYTERMS ||
      characters + term.length > MAX_KEYTERM_CHARACTERS
    ) {
      break;
    }

    result.push(term);
    characters += term.length;
  }

  return result;
}

/**
 * The full transcriber for one business: the shared
 * settings plus the business's keyterms. Sent complete,
 * because an assistantOverrides.transcriber may replace
 * the template's transcriber instead of merging with it.
 */
export function transcriberFor(keyterms) {
  const terms = cleanKeyterms(keyterms);

  if (!terms.length) {
    return null;
  }

  return {
    ...structuredClone(vapiConfig.assistantDefaults.transcriber),
    keyterm: terms,
  };
}
