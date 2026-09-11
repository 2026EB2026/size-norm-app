/**
 * `SCALATAGLIE_` tag parsing.
 *
 * Every product exported from the merchant's ERP carries a tag of the form
 * `SCALATAGLIE_<nome scala>`, where the value is the human-readable name of
 * an Atelier size scale — e.g. `SCALATAGLIE_Scarpe Donna USA`. That name
 * uniquely identifies the scale, and therefore its `sourceScale` base
 * (US/EU/UK/JP-mm/…).
 *
 * This is the single most reliable signal we have: without it the processor
 * derives a scale from vendor + gender, which can pick a scale with a
 * DIFFERENT base than the one the labels were written in — a "39" read as EU
 * when the ERP meant US produces a plausible-looking but completely wrong
 * conversion table, and no alert. Hence the tag outranks every auto-derived
 * candidate (only an explicit `size_norm.scale_sigla` metafield beats it).
 *
 * Values prefixed with `x` (e.g. `xAmericane SML`) are the ERP's own
 * convention for retired scales and are out of V1 scope — see
 * memory/project_v1_scope.md.
 */

/** Tag prefix written by the ERP export. Case-insensitive on read. */
export const SCALE_TAG_PREFIX = "SCALATAGLIE_";

/** Outcome of reading the `SCALATAGLIE_` tag off a product. */
export type ScaleTagParse =
  /** No `SCALATAGLIE_` tag on the product. */
  | { kind: "none" }
  /** Retired scale (`x` prefix): the product is out of V1 scope. */
  | { kind: "out_of_scope"; raw: string }
  /** Exactly one usable value. */
  | { kind: "value"; raw: string; normalized: string }
  /** Two or more conflicting values — we refuse to guess which one wins. */
  | { kind: "ambiguous"; raws: string[] };

/**
 * Canonical form used both for the `SizeScale.tagValue` column and for the
 * value read off a product tag, so the two can be compared with a plain
 * equality lookup: trimmed, inner whitespace collapsed, lowercased.
 *
 * Lowercasing matters — the ERP is inconsistent about case
 * (`SCARPE UNISEX ADIDAS (UK)` vs `Scarpe Donna USA`).
 */
export function normalizeScaleTagValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Extracts the scale value from a product's tag list.
 *
 * Duplicate tags that normalize to the same value are collapsed (the ERP
 * sometimes emits both `SCALATAGLIE_Unica` and a bare `Unica`, and case-only
 * duplicates do occur). Two genuinely different values make the product
 * ambiguous rather than silently picking the first.
 */
export function parseScaleTag(tags: string[]): ScaleTagParse {
  const seen = new Map<string, string>();
  for (const tag of tags) {
    if (!tag.toLowerCase().startsWith(SCALE_TAG_PREFIX.toLowerCase())) continue;
    const raw = tag.slice(SCALE_TAG_PREFIX.length).trim();
    if (raw.length === 0) continue;
    const normalized = normalizeScaleTagValue(raw);
    if (!seen.has(normalized)) seen.set(normalized, raw);
  }

  if (seen.size === 0) return { kind: "none" };
  if (seen.size > 1) return { kind: "ambiguous", raws: [...seen.values()] };

  const [[normalized, raw]] = [...seen.entries()] as [[string, string]];
  if (isOutOfScopeValue(normalized)) return { kind: "out_of_scope", raw };
  return { kind: "value", raw, normalized };
}

/**
 * True for the ERP's retired-scale convention: a leading `x` followed by a
 * letter (so a real scale starting with "X" — none today — would need a
 * second letter to be misread, and `x` alone is not a scale name).
 */
function isOutOfScopeValue(normalized: string): boolean {
  return /^x[a-z]/.test(normalized);
}

/**
 * Status of the `SCALATAGLIE_` tag once the orchestrator has tried to match
 * it against the shop's scales. Passed into the pure processor so the alert
 * is raised *after* the footwear gate — apparel and bags carry scale tags
 * too (`Abb Uomo IT`, `Unica`) and must not generate alerts.
 */
export type ScaleTagStatus =
  | { kind: "absent" }
  | { kind: "resolved"; raw: string; sigla: string }
  | { kind: "out_of_scope"; raw: string }
  | { kind: "unknown"; raw: string }
  | { kind: "ambiguous"; raws: string[] };
