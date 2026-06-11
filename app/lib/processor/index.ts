/**
 * Orchestrator: glues the pure {@link processProduct} to Shopify + Prisma.
 * Used by webhook handlers and the bulk job (M5).
 */

import type { PrismaClient } from "@prisma/client";

import {
  getProductForProcessing,
  setMetafields,
  type Admin,
  type MetafieldWrite,
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
import {
  inferAgeCategoryFromText,
  inferGenderFromText,
} from "./infer-attributes";
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
 *
 * `gender` and `age` must already be the resolved/inferred canonical
 * values (the orchestrator combines metafield + text inference before
 * calling this).
 */
function resolveCandidateSigle(product: {
  vendor: string | null;
  scaleSigla: string | null;
  gender: string | null;
  age: string;
}): string[] {
  const out: string[] = [];

  // 1. Manual override via metafield wins (M3 behavior).
  if (product.scaleSigla !== null && product.scaleSigla.trim().length > 0) {
    out.push(product.scaleSigla.trim());
  }

  const brand =
    product.vendor !== null && product.vendor.trim().length > 0
      ? slugifyBrand(product.vendor)
      : "";

  if (brand.length > 0) {
    // 2. Auto-derive from vendor + gender + age_category.
    if (product.gender !== null) {
      out.push(`${brand}-${product.gender}-${product.age}`);
    }
    // 3. Brand unisex scale: valid for ANY product gender (unisex scales
    // pass validateGenderMatch unconditionally). Covers brands like
    // Birkenstock/Saucony/Hoka that only publish a unisex chart, and
    // products whose gender couldn't be determined at all.
    if (product.gender !== "unisex") {
      out.push(`${brand}-unisex-${product.age}`);
    }
  }

  // 4. Atelier fallback by gender.
  const atelier = atelierFallbackByGender(product.gender);
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

  // ── Attribute resolution ────────────────────────────────────────────
  // Gender: explicit metafield first (normalized: "woman"/"donna"/… are
  // accepted), then inference from title/tags/product type. Same for the
  // kid age category. This is what makes processing "zero-setup": a
  // product titled "Sneakers ASICS donna" processes with no metafields.
  const metafieldGender = normalizeGender(product.gender);
  const inferredGender =
    metafieldGender === null ? inferGenderFromText(product) : null;
  let effectiveGender = metafieldGender ?? inferredGender;

  const metafieldAge =
    product.ageCategory !== null && product.ageCategory.trim().length > 0
      ? product.ageCategory.trim().toLowerCase()
      : null;
  const inferredAge =
    metafieldAge === null && effectiveGender === "kid"
      ? inferAgeCategoryFromText(product)
      : null;
  const effectiveAge = metafieldAge ?? inferredAge ?? "adult";

  // ── Scale resolution, in priority order ─────────────────────────────
  //   1. `product.scaleSigla` (manual override metafield)
  //   2. `{slug(vendor)}-{gender}-{age}` (auto-derived)
  //   3. `{slug(vendor)}-unisex-{age}` (brand unisex accepts any gender)
  //   4. Atelier fallback by gender (G/I/AM)
  //   5. Unique-brand fallback: when the brand has exactly ONE scale for
  //      the age bucket, use it even without a gender signal.
  // Null when nothing matched; the pure processor then emits TABLE_NOT_FOUND.
  let scale: SizeScale | null = null;
  let tables: ConversionTable[] = [];
  const candidateSigle = resolveCandidateSigle({
    vendor: product.vendor,
    scaleSigla: product.scaleSigla,
    gender: effectiveGender,
    age: effectiveAge,
  });
  for (const sigla of candidateSigle) {
    const scaleRow = await prisma.sizeScale.findUnique({
      where: { shopDomain_sigla: { shopDomain, sigla } },
    });
    if (scaleRow === null) continue;
    scale = prismaScaleToEngine(scaleRow);
    break;
  }

  if (
    scale === null &&
    product.vendor !== null &&
    product.vendor.trim().length > 0
  ) {
    const brand = slugifyBrand(product.vendor);
    if (brand.length > 0) {
      const brandScales = await prisma.sizeScale.findMany({
        where: { shopDomain, sigla: { startsWith: `${brand}-` } },
      });
      const forAge = brandScales.filter((s) =>
        s.sigla.endsWith(`-${effectiveAge}`),
      );
      const pool = forAge.length > 0 ? forAge : brandScales;
      if (pool.length === 1) {
        scale = prismaScaleToEngine(pool[0] as PrismaSizeScaleRow);
      }
    }
  }

  if (scale !== null) {
    const tableRows = await prisma.conversionTable.findMany({
      where: { shopDomain, scaleSigla: scale.sigla },
    });
    tables = tableRows.map(prismaTableToEngine);
    // If we still have no gender signal but a scale resolved (unisex
    // candidate or unique-brand fallback), adopt the scale's gender so
    // processProduct's required-gender and consistency checks pass.
    if (effectiveGender === null) {
      effectiveGender = scale.gender;
    }
  }

  // Pass a copy of the product with gender resolved to the canonical 4
  // enum values (from metafield, text inference, or scale adoption).
  const normalizedProduct: typeof product = {
    ...product,
    gender: effectiveGender,
    ageCategory: effectiveAge,
  };
  const result = processProduct({ product: normalizedProduct, scale, tables });
  await applyProcessingResult(admin, prisma, shopDomain, product, result);

  // ── Persist inferred attributes ─────────────────────────────────────
  // When processing succeeded using inferred values, write them back to
  // the product metafields so (a) the merchant sees and can correct them
  // in Shopify admin, and (b) future runs take the explicit-metafield
  // path. The follow-up products/update webhook re-processes once (the
  // snapshot hash changes), converges, then goes quiet.
  if (result.kind === "success") {
    const writes: MetafieldWrite[] = [];
    if (metafieldGender === null && effectiveGender !== null) {
      writes.push({
        ownerId: product.id,
        namespace: "size_norm",
        key: "gender",
        type: "single_line_text_field",
        value: effectiveGender,
      });
    }
    if (metafieldAge === null && inferredAge !== null) {
      writes.push({
        ownerId: product.id,
        namespace: "size_norm",
        key: "age_category",
        type: "single_line_text_field",
        value: inferredAge,
      });
    }
    if (writes.length > 0) {
      await setMetafields(admin, writes);
    }
  }

  return result;
}

export { processProduct } from "./process-product";
export type { ProcessingResult } from "./process-product";
export {
  applyProcessingResult,
  computeProductHash,
  shouldProcessProduct,
} from "./apply-result";
