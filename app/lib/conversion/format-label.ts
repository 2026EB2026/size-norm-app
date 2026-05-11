import type { FractionFormat } from "./types";

/**
 * Maps a decimal fractional part (the `.5` of `41.5`) to the rendered string
 * for each output format. Keys are normalized to 3 decimal places to safely
 * handle thirds (.333, .667).
 */
const FRACTION_TABLE: Record<string, Record<FractionFormat, string>> = {
  "0.500": { UNICODE: "½", DECIMAL: ".5", ASCII: " 1/2" },
  "0.333": { UNICODE: "⅓", DECIMAL: ".333", ASCII: " 1/3" },
  "0.667": { UNICODE: "⅔", DECIMAL: ".667", ASCII: " 2/3" },
  "0.250": { UNICODE: "¼", DECIMAL: ".25", ASCII: " 1/4" },
  "0.750": { UNICODE: "¾", DECIMAL: ".75", ASCII: " 3/4" },
};

/**
 * Formats a decimal-string size (e.g. `"41.5"` or `"42.333"`) into a
 * human-readable label using the merchant's preferred fraction format.
 *
 * - `UNICODE` → `41½` (default, prettiest)
 * - `DECIMAL` → `41.5`
 * - `ASCII` → `41 1/2`
 *
 * Whole numbers always render as the integer (`42` → `"42"` in all formats).
 * Special tokens (M/W combined like `M8/W11`, double-sizing like `3.5/5`) are
 * not rewritten — those preserve their original `source_label`.
 *
 * @throws never; returns the input verbatim if it can't be parsed as decimal.
 */
export function formatLabel(decimal: string, format: FractionFormat): string {
  const trimmed = decimal.trim();
  // Pass-through for compound formats; the conversion pipeline preserves these
  // verbatim and uses their `source_label` for display.
  if (trimmed.includes("/")) return trimmed;

  // Accept both `.` and `,` as decimal separators on input.
  const normalized = trimmed.replace(",", ".");
  const asNumber = Number(normalized);
  if (!Number.isFinite(asNumber)) return decimal;

  const whole = Math.trunc(asNumber);
  // Fractional part to 3 decimal places, safe for halves and thirds alike.
  const frac = Math.abs(asNumber - whole);
  if (frac < 0.0005) return String(whole);

  const fracKey = frac.toFixed(3);
  const formats = FRACTION_TABLE[fracKey];
  if (!formats) {
    // Unknown fraction (shouldn't happen on validated input). Fall back to
    // decimal rendering to avoid losing information.
    return normalized;
  }
  if (format === "ASCII") return `${whole}${formats.ASCII}`;
  return `${whole}${formats[format]}`;
}
