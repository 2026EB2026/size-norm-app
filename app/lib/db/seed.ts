import {
  ATELIER_SCALES_V1,
  BRAND_CONVERSION_TABLES_V1,
  BRAND_SCALES_V1,
  GENERIC_CONVERSION_TABLES_V1,
} from "../conversion";
import type {
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
/** Cache of which shops have had brand scales seeded in this process. */
const brandScalesSeededInProcess = new Set<string>();

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
  await tx.sizeScale.upsert({
    where: { shopDomain_sigla: { shopDomain, sigla: scale.sigla } },
    create: {
      shopDomain,
      sigla: scale.sigla,
      name: scale.name,
      gender: toPrismaGender(scale.gender),
      sourceScale: toPrismaSourceScale(scale.sourceScale),
      labels: scale.labels,
      aliases: scale.aliases,
    },
    update: {},
  });

  if (table === null) return;
  const existing = await tx.conversionTable.findFirst({
    where: {
      shopDomain,
      scaleSigla: table.scaleSigla,
      brand: null,
    },
  });
  if (existing !== null) return;
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
  // Vercel cold start; afterwards a quick Set check skips the DB work.
  if (!brandScalesSeededInProcess.has(shopDomain)) {
    try {
      await prisma.$transaction(async (tx) => {
        for (const scale of BRAND_SCALES_V1) {
          const table = BRAND_CONVERSION_TABLES_V1.find(
            (t) => t.scaleSigla === scale.sigla,
          );
          await upsertScale(
            tx as typeof prisma,
            shopDomain,
            scale,
            table ?? null,
          );
        }
      });
      brandScalesSeededInProcess.add(shopDomain);
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
