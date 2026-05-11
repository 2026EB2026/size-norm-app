import type { NormalizedLabel, SizeScale } from "./types";

/** Unicode fractional glyphs we recognize. Mapped to decimal-string suffixes. */
const FRACTION_GLYPHS: Record<string, string> = {
  "½": ".5",
  "⅓": ".333",
  "⅔": ".667",
  "¼": ".25",
  "¾": ".75",
};

/** ASCII fraction tokens we recognize. */
const ASCII_FRACTIONS: Record<string, string> = {
  "1/2": ".5",
  "1/3": ".333",
  "2/3": ".667",
  "1/4": ".25",
  "3/4": ".75",
};

const ASCII_FRACTION_REGEX = /(\d+)\s*(1\/2|1\/3|2\/3|1\/4|3\/4)/g;

/**
 * Normalizes a raw variant option value to the canonical form used by the
 * scale. Supports unicode glyphs (`½`, `⅓`, `⅔`, `¼`, `¾`), ASCII fractions
 * (`1/2`, `1/3`, `2/3`, `1/4`, `3/4`), comma decimals (`38,5`), dot decimals
 * (`38.5`), and various whitespace patterns (`38 1/2`, `381/2`).
 *
 * Compound formats (`M8/W11`, `3.5/5`) are NOT rewritten — they match
 * directly against the scale's `labels` array which stores them verbatim.
 *
 * Returns `null` when the input cannot be matched against the scale.
 */
export function parseLabel(
  input: string | null | undefined,
  scale: SizeScale,
): NormalizedLabel | null {
  if (input == null) return null;
  const raw = input.toString();
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const candidates = enumerateCandidates(trimmed);

  // 1) Aliases — case-insensitive on the alias key.
  for (const candidate of candidates) {
    const aliasHit = scale.aliases[candidate.toLowerCase()];
    if (aliasHit !== undefined) {
      return { raw, canonical: aliasHit };
    }
  }

  // 2) Direct label match (case-sensitive).
  for (const candidate of candidates) {
    if (scale.labels.includes(candidate)) {
      return { raw, canonical: candidate };
    }
  }

  // 3) Final attempt: case-insensitive label match (for non-numeric labels).
  const lowerTrimmed = trimmed.toLowerCase();
  for (const label of scale.labels) {
    if (label.toLowerCase() === lowerTrimmed) {
      return { raw, canonical: label };
    }
  }

  return null;
}

/**
 * Enumerates the canonical forms we should try matching against the scale.
 *
 * The pipeline:
 *   1. The literal input.
 *   2. All-dot decimal form (commas → dots, glyphs → decimals, ASCII fracs →
 *      decimals, whitespace stripped).
 *   3. Comma form of (2) — scales like `#BL` store labels with commas.
 *   4. Unicode form of (2) — scales like `AM`, `G`, `I` store labels with
 *      unicode glyphs.
 *   5. Plain whitespace-stripped form.
 */
function enumerateCandidates(input: string): string[] {
  const forms = new Set<string>();
  forms.add(input);

  // Stripped of internal whitespace.
  const stripped = input.replace(/\s+/g, "");
  forms.add(stripped);

  // Comma → dot (universal first step toward decimal form).
  const dotted = input.replace(/,/g, ".");
  if (dotted !== input) forms.add(dotted);

  // Unicode glyphs → decimal suffix.
  const glyphedToDot = replaceGlyphs(dotted);
  if (glyphedToDot !== dotted) forms.add(glyphedToDot);

  // ASCII fractions → decimal suffix.
  const asciiToDot = replaceAsciiFractions(glyphedToDot);
  if (asciiToDot !== glyphedToDot) forms.add(asciiToDot);

  // Final "dotForm" with all transformations + whitespace stripped.
  const dotForm = asciiToDot.replace(/\s+/g, "");
  forms.add(dotForm);

  // Comma variant of the dot form (scales like `#BL` use `,` canonically).
  if (dotForm.includes(".")) {
    forms.add(dotForm.replace(/\./g, ","));
  }

  // Unicode variant of the dot form (scales like `G`, `AM`, `I` use glyphs).
  const uniForm = decimalToUnicode(dotForm);
  if (uniForm !== dotForm) forms.add(uniForm);

  return Array.from(forms);
}

function replaceGlyphs(s: string): string {
  let out = s;
  for (const [glyph, decimal] of Object.entries(FRACTION_GLYPHS)) {
    out = out.split(glyph).join(decimal);
  }
  return out;
}

function replaceAsciiFractions(s: string): string {
  return s.replace(ASCII_FRACTION_REGEX, (_match, whole: string, frac: string) => {
    const replacement = ASCII_FRACTIONS[frac];
    return replacement === undefined ? `${whole}${frac}` : `${whole}${replacement}`;
  });
}

function decimalToUnicode(s: string): string {
  return s.replace(/(\d+)\.(\d{1,3})/g, (match, whole: string, frac: string) => {
    const key = `0.${frac.padEnd(3, "0").slice(0, 3)}`;
    const glyph = decimalKeyToGlyph(key);
    if (glyph === null) return match;
    return `${whole}${glyph}`;
  });
}

function decimalKeyToGlyph(key: string): string | null {
  switch (key) {
    case "0.500":
      return "½";
    case "0.333":
      return "⅓";
    case "0.667":
      return "⅔";
    case "0.250":
      return "¼";
    case "0.750":
      return "¾";
    default:
      return null;
  }
}
