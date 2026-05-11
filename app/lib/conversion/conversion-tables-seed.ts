import {
  KID_MASTER,
  MEN_MASTER,
  WOMEN_MASTER,
  findRowByColumn,
  type MasterRow,
} from "./master-tables";
import { ATELIER_SCALES_V1 } from "./scales-seed";
import type {
  ConversionMapping,
  ConversionTable,
  SizeScale,
  SourceScale,
} from "./types";

/**
 * Strips the `,` decimal separator used by Italian kid scales (`#BK`, `#BL`)
 * so the value matches the dot-form in {@link KID_MASTER}.
 */
function normalizeCommaDecimal(label: string): string {
  return label.replace(",", ".");
}

/**
 * Returns the appropriate master table for a scale's gender. For unisex
 * adult scales we use MEN_MASTER (the conservative choice — caller can fall
 * back to WOMEN_MASTER if needed via separate logic).
 */
function pickMaster(scale: SizeScale): MasterRow[] {
  switch (scale.gender) {
    case "men":
      return MEN_MASTER;
    case "women":
      return WOMEN_MASTER;
    case "unisex":
      return MEN_MASTER;
    case "kid":
      return KID_MASTER;
  }
}

/** Maps a `SourceScale` to the corresponding column key in `MasterRow`. */
function columnKey(sourceScale: SourceScale): keyof MasterRow | null {
  switch (sourceScale) {
    case "EU":
      return "eu";
    case "US":
      return "us";
    case "UK":
      return "uk";
    case "JP_MM":
      return "jpMm";
    case "DOUBLE":
    case "MW_COMBINED":
      // Handled by separate code path.
      return null;
  }
}

/** Empty mapping — used when no master row matches. */
function emptyMapping(sourceLabel: string): ConversionMapping {
  return { sourceLabel, us: null, eu: null, uk: null, jpMm: null };
}

/** Build a mapping from a single MasterRow, preserving source label. */
function mappingFromRow(
  sourceLabel: string,
  row: MasterRow,
  overrides: Partial<ConversionMapping> = {},
): ConversionMapping {
  return {
    sourceLabel,
    us: overrides.us !== undefined ? overrides.us : row.us,
    eu: overrides.eu !== undefined ? overrides.eu : row.eu,
    uk: overrides.uk !== undefined ? overrides.uk : row.uk,
    jpMm: overrides.jpMm !== undefined ? overrides.jpMm : row.jpMm,
  };
}

/**
 * Parses a double-sizing label `X/Y` into its numeric men's part.
 * Returns `null` if the label doesn't match the expected pattern.
 */
function menPartOfDouble(label: string): string | null {
  const match = label.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (match === null) return null;
  return match[1] ?? null;
}

/**
 * Parses an M/W-combined label `M<X>/W<Y>` (with `½` accepted on either side)
 * into its numeric men's part as a decimal string.
 */
function menPartOfMWCombined(label: string): string | null {
  // Allow `M8/W9.5`, `M8½/W10½`, `M8.5/W10.5`.
  const normalized = label.replace(/½/g, ".5");
  const match = normalized.match(/^M(\d+(?:\.\d+)?)\/W(\d+(?:\.\d+)?)$/);
  if (match === null) return null;
  return match[1] ?? null;
}

/**
 * For JP mondopoint scales, the merchant's labels are in **cm** (e.g. `"25.5"`
 * = 25.5 cm) while the master tables store `jpMm` as integer **mm** (e.g. 255).
 * This helper converts a cm label to mm for lookup.
 */
function jpCmLabelToMm(label: string): number | null {
  const normalized = normalizeCommaDecimal(label);
  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 10);
}

/**
 * Looks up a label in the appropriate master table, falling back to the kid
 * table when the gender is `kid` and the EU value is below the women's range
 * but within the kid range.
 *
 * Returns the matched MasterRow, or `null` when there's no match.
 */
function lookupMasterForLabel(
  scale: SizeScale,
  label: string,
): MasterRow | null {
  const colKey = columnKey(scale.sourceScale);
  if (colKey === null) return null;

  // JP_MM scales use cm labels in the source (e.g. "25.5" = 255mm).
  if (scale.sourceScale === "JP_MM") {
    const mm = jpCmLabelToMm(label);
    if (mm === null) return null;
    return findRowByColumn(pickMaster(scale), "jpMm", mm);
  }

  const normalizedLabel = normalizeCommaDecimal(label);
  const primary = pickMaster(scale);
  const hit = findRowByColumn(primary, colKey, normalizedLabel);
  if (hit !== null) return hit;

  // For larger kid sizes (EU >= 34), fall through to women's table.
  if (scale.gender === "kid") {
    return findRowByColumn(WOMEN_MASTER, colKey, normalizedLabel);
  }
  return null;
}

/**
 * Builds the mapping for a single label in a scale. Handles all five
 * SourceScale kinds.
 */
function buildMapping(scale: SizeScale, label: string): ConversionMapping {
  // Double sizing: matrix US preserves the compound label, other columns from
  // the men's side of the pair.
  if (scale.sourceScale === "DOUBLE") {
    const menPart = menPartOfDouble(label);
    if (menPart === null) return emptyMapping(label);
    const row = findRowByColumn(MEN_MASTER, "us", menPart);
    if (row === null) return emptyMapping(label);
    return mappingFromRow(label, row, { us: label });
  }

  // M/W combined: matrix US preserves the `M<X>/W<Y>` token, other columns
  // from the men's side.
  if (scale.sourceScale === "MW_COMBINED") {
    const menPart = menPartOfMWCombined(label);
    if (menPart === null) return emptyMapping(label);
    const row = findRowByColumn(MEN_MASTER, "us", menPart);
    if (row === null) return emptyMapping(label);
    return mappingFromRow(label, row, { us: label });
  }

  // Bambino US K-prefix sizes — not covered by KID_MASTER directly because
  // those use a different convention. Skip until merchant validates in M3.
  if (label.startsWith("K")) {
    return emptyMapping(label);
  }

  const row = lookupMasterForLabel(scale, label);
  if (row === null) return emptyMapping(label);
  return mappingFromRow(label, row);
}

/**
 * Builds the generic Conversion Table for a single Atelier scale by walking
 * the scale's labels and looking each one up in the master tables.
 *
 * The output is marked `isSeed: true`. Merchant validates in M3.
 */
export function buildGenericConversionTable(
  scale: SizeScale,
): ConversionTable {
  const mappings = scale.labels.map((label) => buildMapping(scale, label));
  return {
    scaleSigla: scale.sigla,
    brand: null,
    isSeed: true,
    mappings,
  };
}

/**
 * Seed Conversion Tables for the 28 V1 scales. All `brand: null`, all
 * `isSeed: true`. These are stored in DB on first install and surfaced in the
 * admin UI for validation before go-live.
 */
export const GENERIC_CONVERSION_TABLES_V1: readonly ConversionTable[] =
  ATELIER_SCALES_V1.map(buildGenericConversionTable);
