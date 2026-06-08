import {
  ATELIER_SCALES_V1,
  BRAND_CM_OVERRIDES_V1,
  BRAND_CONVERSION_TABLES_V1,
  BRAND_SCALES_V1,
  GENERIC_CONVERSION_TABLES_V1,
} from "../conversion";
import type {
  ConversionMapping,
  ConversionTable,
  Gender,
  SizeScale,
  SourceScale,
} from "../conversion";
import {
  ensureMetafieldDefinitions,
  type Admin,
} from "../shopify/client";
import prisma from "../../db.server";

/** Maps engine Gender → Prisma enum form. */
function toPrismaGender(g: Gender): "MEN" | "WOMEN" | "UNISEX" | "KID" {
  switch (g) {
    case "men":
      return "MEN";
    case "women":
      return "WOMEN";
    case "unisex":
      return "UNISEX";
    case "kid":
      return "KID";
  }
}

/** Maps engine SourceScale → Prisma enum form. */
function toPrismaSourceScale(
  s: SourceScale,
): "US" | "EU" | "UK" | "JP_MM" | "DOUBLE" | "MW_COMBINED" {
  return s;
}

/** Cache of which shops have had metafield definitions ensured in this process. */
const metafieldDefsEnsuredInProcess = new Set<string>();
/**
 * Cache of which shops have had brand scales seeded in this process.
 *
 * The seed value embeds the CM-overrides revision so that updating the
 * overrides file bumps the key and forces a re-seed at the next visit,
 * propagating new CM data to every shop's existing tables. Bump
 * BRAND_SEED_REVISION whenever you ship breaking changes to the brand
 * scales seed or its CM-overrides companion file.
 */
const BRAND_SEED_REVISION = "v3-cross-scale-aliases";
const brandScalesSeededInProcess = new Set<string>();

/**
 * Merges hand-sourced CM data from {@link BRAND_CM_OVERRIDES_V1} into the
 * mapping rows of a brand-specific conversion table. Returns a new array
 * with the overrides applied; the input is not mutated. Mappings whose
 * sourceLabel doesn't appear in the override map are passed through
 * unchanged, preserving every other field of each row.
 */
function applyCmOverrides(
  scaleSigla: string,
  mappings: ConversionMapping[],
): ConversionMapping[] {
  const overrides = BRAND_CM_OVERRIDES_V1[scaleSigla];
  if (overrides === undefined) return mappings;
  return mappings.map((m) => {
    const cm = overrides[m.sourceLabel];
    if (cm === undefined) return m;
    return { ...m, cm };
  });
}

/**
 * Enriches the scale's `aliases` map so that variant labels in any of the
 * canonical column systems (US/EU/UK/CM/JP-mm) resolve to the scale's
 * native `sourceLabel`. This lets a product whose variants are labelled
 * "39, 40, 41" (EU) still process correctly even when the assigned scale
 * was uploaded with US sourceLabels — `parseLabel` will see "39" in the
 * aliases map and return the canonical US sourceLabel for `lookupConversion`.
 *
 * The merge is conservative: existing aliases from the seed always win
 * over auto-derived ones. We only fill in keys that aren't already
 * present, and only when the column value differs from the sourceLabel
 * itself (no point aliasing "9" → "9").
 */
function enrichAliasesFromTable(
  baseAliases: Record<string, string>,
  mappings: ConversionMapping[],
): Record<string, string> {
  const aliases: Record<string, string> = { ...baseAliases };
  // Pre-build a Set of existing alias keys (lowercased) so we don't
  // double-add and don't overwrite manually-curated entries.
  const existing = new Set(Object.keys(aliases).map((k) => k.toLowerCase()));

  const addAlias = (
    key: string | number | null | undefined,
    canonical: string,
  ): void => {
    if (key === null || key === undefined) return;
    const k = String(key).trim();
    if (k.length === 0 || k === canonical) return;
    const kLower = k.toLowerCase();
    if (existing.has(kLower)) return;
    aliases[k] = canonical;
    existing.add(kLower);
  };

  for (const m of mappings) {
    const canonical = m.sourceLabel;
    addAlias(m.us, canonical);
    addAlias(m.eu, canonical);
    addAlias(m.uk, canonical);
    addAlias(m.cm, canonical);
    addAlias(m.jpMm, canonical);
    // Extended columns from the parser (fr, jp, kr, gender-specific
    // variants) also count — a variant labelled with a Japanese mondopoint
    // cm value (e.g. "240") or a French Paris-point should still match.
    addAlias(m.fr, canonical);
    addAlias(m.jp, canonical);
    addAlias(m.kr, canonical);
    addAlias(m.usM, canonical);
    addAlias(m.usW, canonical);
    addAlias(m.euM, canonical);
    addAlias(m.euW, canonical);
    addAlias(m.ukM, canonical);
    addAlias(m.ukW, canonical);
    addAlias(m.cmM, canonical);
    addAlias(m.cmW, canonical);
  }

  return aliases;
}

/**
 * Upserts a single scale + (optionally) its generic conversion table for one
 * shop. Used for both ATELIER and BRAND scales.
 */
async function upsertScale(
  tx: typeof prisma,
  shopDomain: string,
  scale: SizeScale,
  table: ConversionTable | null,
): Promise<void> {
  // Auto-derive cross-scale aliases from the conversion table so that
  // variants labelled in US/EU/UK/CM (any column) resolve to the scale's
  // native sourceLabel during processing. Seed-provided aliases always
  // win — the enrichment only fills in keys that aren't already present.
  const enrichedAliases =
    table === null
      ? scale.aliases
      : enrichAliasesFromTable(scale.aliases, table.mappings);

  await tx.sizeScale.upsert({
    where: { shopDomain_sigla: { shopDomain, sigla: scale.sigla } },
    create: {
      shopDomain,
      sigla: scale.sigla,
      name: scale.name,
      gender: toPrismaGender(scale.gender),
      sourceScale: toPrismaSourceScale(scale.sourceScale),
      labels: scale.labels,
      aliases: enrichedAliases,
    },
    // Refresh aliases on every seed run so newly-added auto-aliases reach
    // existing shops without requiring uninstall. We never touch other
    // fields here because the merchant may have edited the scale rows
    // (e.g. added a label to `labels[]`) and we don't want to clobber.
    update: { aliases: enrichedAliases },
  });

  if (table === null) return;
  const existing = await tx.conversionTable.findFirst({
    where: {
      shopDomain,
      scaleSigla: table.scaleSigla,
      brand: null,
    },
  });
  if (existing !== null) {
    // If the merchant has marked the table as validated (isSeed=false), keep
    // their data — they own it. If it's still a seed, refresh the mappings
    // so bug fixes in our seed data propagate to existing shops.
    if (!existing.isSeed) return;
    await tx.conversionTable.update({
      where: { id: existing.id },
      data: { mappings: table.mappings as never },
    });
    return;
  }
  await tx.conversionTable.create({
    data: {
      shopDomain,
      scaleSigla: table.scaleSigla,
      brand: null,
      isSeed: true,
      mappings: table.mappings as never,
    },
  });
}

/**
 * Idempotent first-install seed.
 *
 * On the first authenticated visit by a merchant, this:
 *   1. Upserts the `Shop` row (so `installedAt` is recorded).
 *   2. Creates Shopify Metafield Definitions for the `size_norm` namespace
 *      (idempotent — each definition swallows `TAKEN` errors).
 *   3. If `Shop.seededAt` is null, inserts the 28 Atelier scales + 28 generic
 *      conversion tables.
 *   4. Independent of `seededAt`: seeds the brand-official scales (120 scales
 *      with their generic conversion tables) — these are upserts so safe to
 *      re-run. Cached per-process so warm requests are no-ops.
 *   5. Sets `Shop.seededAt = now()` after Atelier seed.
 */
export async function ensureSeed(
  shopDomain: string,
  admin: Admin,
): Promise<void> {
  const shop = await prisma.shop.upsert({
    where: { shopDomain },
    create: { shopDomain },
    update: {},
  });

  // Step 2 — Metafield Definitions
  if (!metafieldDefsEnsuredInProcess.has(shopDomain)) {
    try {
      await ensureMetafieldDefinitions(admin);
      metafieldDefsEnsuredInProcess.add(shopDomain);
    } catch (e) {
      // eslint-disable-next-line no-undef, no-console
      console.warn(
        `[size-norm] ensureMetafieldDefinitions failed for ${shopDomain}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  // Step 3 — Atelier seed (one-shot via seededAt)
  if (shop.seededAt === null) {
    await prisma.$transaction(async (tx) => {
      for (const scale of ATELIER_SCALES_V1) {
        const table = GENERIC_CONVERSION_TABLES_V1.find(
          (t) => t.scaleSigla === scale.sigla,
        );
        await upsertScale(tx as typeof prisma, shopDomain, scale, table ?? null);
      }
      await tx.shop.update({
        where: { shopDomain },
        data: { seededAt: new Date() },
      });
    });
  }

  // Step 4 — Brand scales (idempotent, cached per-process). Runs once per
  // Vercel cold start (per revision); afterwards a quick Set check skips
  // the DB work. The cache key includes BRAND_SEED_REVISION so that
  // shipping a new overrides revision invalidates the in-memory cache and
  // refreshes the mappings in every shop's existing seed tables.
  const cacheKey = `${shopDomain}@${BRAND_SEED_REVISION}`;
  if (!brandScalesSeededInProcess.has(cacheKey)) {
    try {
      await prisma.$transaction(async (tx) => {
        for (const scale of BRAND_SCALES_V1) {
          const baseTable = BRAND_CONVERSION_TABLES_V1.find(
            (t) => t.scaleSigla === scale.sigla,
          );
          // Apply hand-sourced CM overrides on the way in. The original
          // seed array is untouched; only the per-shop DB rows receive
          // the patched mappings.
          const table: ConversionTable | null =
            baseTable === undefined
              ? null
              : {
                  ...baseTable,
                  mappings: applyCmOverrides(
                    baseTable.scaleSigla,
                    baseTable.mappings,
                  ),
                };
          await upsertScale(tx as typeof prisma, shopDomain, scale, table);
        }
      });
      brandScalesSeededInProcess.add(cacheKey);
    } catch (e) {
      // eslint-disable-next-line no-undef, no-console
      console.warn(
        `[size-norm] brand-scales seed failed for ${shopDomain}:`,
        e instanceof Error ? e.message : e,
      );
      // Leave the flag unset so the next request retries.
    }
  }
}
