import type { ConversionResult, ConversionTable } from "./types";

/**
 * Resolves a normalized source label to a US/EU/UK/JP-mm matrix using the
 * priority rule defined in section 3.2 of the project handover:
 *
 * 1. Brand-specific table for `(scaleSigla, brand)` — case-insensitive on
 *    brand, trimmed.
 * 2. Generic table for `(scaleSigla, brand = null)`.
 * 3. No match → `null`.
 *
 * Brand normalization is case-insensitive + whitespace-trimmed because
 * `product.vendor` in Shopify is a free-form string and merchants often have
 * typos like `gucci` vs `Gucci` vs `GUCCI ` (trailing space).
 *
 * The caller is expected to have already validated the label via
 * {@link parseLabel}; `normalizedLabel` must be one of the values from the
 * scale's `labels` array.
 */
export function lookupConversion(
  scaleSigla: string,
  brand: string | null,
  normalizedLabel: string,
  tables: ConversionTable[],
): ConversionResult | null {
  const normalizedBrand =
    brand == null ? null : brand.toLowerCase().trim();

  // 1) Brand-specific match (only if a brand was provided).
  if (normalizedBrand !== null && normalizedBrand.length > 0) {
    const brandTable = tables.find(
      (t) =>
        t.scaleSigla === scaleSigla &&
        t.brand !== null &&
        t.brand.toLowerCase().trim() === normalizedBrand,
    );
    if (brandTable !== undefined) {
      const mapping = brandTable.mappings.find(
        (m) => m.sourceLabel === normalizedLabel,
      );
      if (mapping !== undefined) {
        return {
          matrix: {
            us: mapping.us,
            eu: mapping.eu,
            uk: mapping.uk,
            cm: mapping.cm ?? null,
            jpMm: mapping.jpMm,
          },
          sourceLabel: normalizedLabel,
          fromBrandSpecific: true,
          brandUsed: brandTable.brand,
        };
      }
    }
  }

  // 2) Generic fallback.
  const genericTable = tables.find(
    (t) => t.scaleSigla === scaleSigla && t.brand === null,
  );
  if (genericTable !== undefined) {
    const mapping = genericTable.mappings.find(
      (m) => m.sourceLabel === normalizedLabel,
    );
    if (mapping !== undefined) {
      return {
        matrix: {
          us: mapping.us,
          eu: mapping.eu,
          uk: mapping.uk,
          cm: mapping.cm ?? null,
          jpMm: mapping.jpMm,
        },
        sourceLabel: normalizedLabel,
        fromBrandSpecific: false,
        brandUsed: null,
      };
    }
  }

  return null;
}
