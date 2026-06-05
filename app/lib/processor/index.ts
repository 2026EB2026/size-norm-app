/**
 * Orchestrator: glues the pure {@link processProduct} to Shopify + Prisma.
 * Used by webhook handlers and the bulk job (M5).
 */

import type { PrismaClient } from "@prisma/client";

import {
  getProductForProcessing,
  type Admin,
} from "../shopify/client";
import type {
  ConversionTable,
  Gender,
  SizeScale,
  SourceScale,
} from "../conversion";

import {
  applyProcessingResult,
  shouldProcessProduct,
} from "./apply-result";
import { processProduct, type ProcessingResult } from "./process-product";

type PrismaSizeScaleRow = {
  sigla: string;
  name: string;
  gender: "MEN" | "WOMEN" | "UNISEX" | "KID";
  sourceScale: "US" | "EU" | "UK" | "JP_MM" | "DOUBLE" | "MW_COMBINED";
  labels: unknown;
  aliases: unknown;
};

type PrismaConversionTableRow = {
  scaleSigla: string;
  brand: string | null;
  isSeed: boolean;
  mappings: unknown;
};

/** Maps a Prisma SizeScale row to the engine's SizeScale shape. */
function prismaScaleToEngine(row: PrismaSizeScaleRow): SizeScale {
  return {
    sigla: row.sigla,
    name: row.name,
    gender: row.gender.toLowerCase() as Gender,
    sourceScale: row.sourceScale as SourceScale,
    labels: (row.labels as string[]) ?? [],
    aliases: (row.aliases as Record<string, string>) ?? {},
  };
}

/** Maps a Prisma ConversionTable row to the engine's ConversionTable shape. */
function prismaTableToEngine(row: PrismaConversionTableRow): ConversionTable {
  return {
    scaleSigla: row.scaleSigla,
    brand: row.brand,
    isSeed: row.isSeed,
    mappings: (row.mappings as ConversionTable["mappings"]) ?? [],
  };
}

/**
 * Slugifies a brand name to match the convention used by `brand-scales-seed.ts`
 * (lowercase, dashes, "kids" suffix stripped). Keep in sync with
 * `_scripts/parse_brand_scales.py:slugify`.
 */
function slugifyBrand(vendor: string): string {
  return vendor
    .toLowerCase()
    .trim()
    .replace(/\s+kids$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Canonicalizes a free-form gender value to the four enum values the engine
 * uses (`men`, `women`, `unisex`, `kid`). Accepts common merchant inputs in
 * English (singular/plural) and Italian:
 *   - men, man, uomo, maschile → "men"
 *   - women, woman, donna, femminile → "women"
 *   - unisex → "unisex"
 *   - kid, kids, bambino, bambina, boy, girl → "kid"
 *
 * Returns `null` for unrecognised values so downstream code can surface a
 * MISSING_METAFIELD alert with a helpful message.
 */
export function normalizeGender(raw: string | null): string | null {
  if (raw === null) return null;
  const v = raw.trim().toLowerCase();
  if (v.length === 0) return null;
  if (v === "men" || v === "man" || v === "uomo" || v === "maschile") return "men";
  if (v === "women" || v === "woman" || v === "donna" || v === "femminile") return "women";
  if (v === "unisex") return "unisex";
  if (
    v === "kid" ||
    v === "kids" ||
    v === "bambino" ||
    v === "bambina" ||
    v === "boy" ||
    v === "girl"
  ) {
    return "kid";
  }
  return null;
}

/**
 * Atelier scale to fall back to when no brand-specific scale matches the
 * product's vendor. Provides "always-something" coverage for the common
 * Italian-retail genders.
 */
function atelierFallbackByGender(
  gender: string | null,
): string | null {
  // Caller is expected to pass the normalized gender — this function only
  // matches the canonical 4 values.
  switch (gender) {
    case "men":
      return "G"; // Scarpe Uomo IT
    case "women":
      return "I"; // Scarpe Donna IT
    case "unisex":
      return "AM"; // Scarpe Unisex IT
    default:
      return null; // kid has too many subcategories — require explicit sigla
  }
}

/**
 * Builds the ordered list of scale sigle to try for one product, most
 * specific first. The processor uses the first sigla that resolves to a
 * SizeScale row in DB.
 */
function resolveCandidateSigle(product: {
  vendor: string | null;
  gender: string | null;
  scaleSigla: string | null;
  ageCategory: string | null;
}): string[] {
  const out: string[] = [];

  // 1. Manual override via metafield wins (M3 behavior).
  if (product.scaleSigla !== null && product.scaleSigla.trim().length > 0) {
    out.push(product.scaleSigla.trim());
  }

  // Normalize gender once (accepts "woman"/"donna"/"man"/"uomo"/etc).
  const normalizedGender = normalizeGender(product.gender);

  // 2. Auto-derive from vendor + gender + age_category.
  if (
    product.vendor !== null &&
    product.vendor.trim().length > 0 &&
    normalizedGender !== null
  ) {
    const brand = slugifyBrand(product.vendor);
    const age =
      product.ageCategory !== null && product.ageCategory.trim().length > 0
        ? product.ageCategory.trim().toLowerCase()
        : "adult";
    if (brand.length > 0) {
      out.push(`${brand}-${normalizedGender}-${age}`);
    }
  }

  // 3. Atelier fallback by normalized gender.
  const atelier = atelierFallbackByGender(normalizedGender);
  if (atelier !== null) out.push(atelier);

  return out;
}

/**
 * Runs the full processing pipeline for one product:
 *   1. Fetch product+variants+metafields from Shopify
 *   2. Optionally short-circuit if nothing relevant changed (snapshot hash)
 *   3. Load scale + conversion tables from DB
 *   4. Run the pure processor
 *   5. Apply mutations (metafields, status, tags) and persist alerts/snapshot
 *
 * Pass `force: true` to skip the snapshot-hash short-circuit (used by bulk
 * re-scan in M5 and by manual override in the admin UI).
 *
 * Returns the result of the processing run, or the sentinel
 * `{ kind: "skip", reason: "unchanged" }` if short-circuited.
 */
export async function runProcessor(
  admin: Admin,
  prisma: PrismaClient,
  shopDomain: string,
  productGid: string,
  options: { force?: boolean } = {},
): Promise<ProcessingResult | { kind: "skip"; reason: "unchanged" }> {
  const product = await getProductForProcessing(admin, productGid);

  if (options.force !== true) {
    const decision = await shouldProcessProduct(prisma, shopDomain, product);
    if (decision === "skip-unchanged") {
      return { kind: "skip", reason: "unchanged" };
    }
  }

  // Resolve which SizeScale to use, in priority order:
  //   1. `product.scaleSigla` (manual override metafield)
  //   2. Auto-derived from vendor + gender + age_category:
  //        `{slug(vendor)}-{gender}-{age_category|"adult"}`
  //   3. Atelier fallback by gender (G/I/AM for men/women/unisex)
  // Returns null when none of the above resolves; the pure processor will
  // then emit a TABLE_NOT_FOUND alert.
  let scale: SizeScale | null = null;
  let tables: ConversionTable[] = [];
  const candidateSigle = resolveCandidateSigle(product);
  for (const sigla of candidateSigle) {
    const scaleRow = await prisma.sizeScale.findUnique({
      where: { shopDomain_sigla: { shopDomain, sigla } },
    });
    if (scaleRow === null) continue;
    scale = prismaScaleToEngine(scaleRow);
    const tableRows = await prisma.conversionTable.findMany({
      where: { shopDomain, scaleSigla: scaleRow.sigla },
    });
    tables = tableRows.map(prismaTableToEngine);
    break;
  }

  // Pass a copy of the product with the gender field normalized to the
  // canonical 4 enum values. This lets the merchant type "woman"/"donna" and
  // still pass both the MISSING_METAFIELD check and the gender-vs-scale
  // consistency check in processProduct.
  const normalizedProduct: typeof product = {
    ...product,
    gender: normalizeGender(product.gender),
  };
  const result = processProduct({ product: normalizedProduct, scale, tables });
  await applyProcessingResult(admin, prisma, shopDomain, product, result);
  return result;
}

export { processProduct } from "./process-product";
export type { ProcessingResult } from "./process-product";
export {
  applyProcessingResult,
  computeProductHash,
  shouldProcessProduct,
} from "./apply-result";
