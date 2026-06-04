import {
  ATELIER_SCALES_V1,
  GENERIC_CONVERSION_TABLES_V1,
} from "../conversion";
import type { Gender, SourceScale } from "../conversion";
import {
  ensureMetafieldDefinitions,
  type Admin,
} from "../shopify/client";
import prisma from "../../db.server";

/**
 * Maps the conversion engine's lowercase Gender to the Prisma enum form.
 */
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

/**
 * Maps the conversion engine's SourceScale to the Prisma enum form. The
 * conversion engine's `SourceScale` already uses uppercase strings, so this
 * is mostly an identity cast, but typed explicitly to match Prisma.
 */
function toPrismaSourceScale(
  s: SourceScale,
): "US" | "EU" | "UK" | "JP_MM" | "DOUBLE" | "MW_COMBINED" {
  return s;
}

/**
 * Per-process cache of which shops have had Metafield Definitions ensured
 * during the current Vercel function lifetime. Avoids re-running the 11
 * GraphQL idempotent definition-create calls on every admin page load
 * (since serverless processes are reused for many requests).
 *
 * On a cold start this resets — that's fine: the underlying call swallows
 * `TAKEN` errors so re-running is cheap and safe.
 */
const metafieldDefsEnsuredInProcess = new Set<string>();

/**
 * Idempotent first-install seed.
 *
 * On the first authenticated visit by a merchant, this:
 *   1. Upserts the `Shop` row (so `installedAt` is recorded).
 *   2. Creates Shopify Metafield Definitions for the `size_norm` namespace
 *      (idempotent — each definition swallows `TAKEN` errors). This runs
 *      ONCE per Vercel process, independent of `seededAt`, so shops that
 *      installed before this code existed still get their definitions.
 *   3. If `Shop.seededAt` is null, inserts the 28 V1 `SizeScale` rows and the
 *      28 generic `ConversionTable` rows from the conversion engine's seed.
 *   4. Sets `Shop.seededAt = now()` so subsequent calls are no-ops.
 *
 * Called from `app/routes/app.tsx` loader.
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

  // Step 2 — Metafield Definitions. Independent of seededAt because earlier
  // app versions didn't create them, and existing installs need them
  // back-filled. Cached per-process to keep page loads cheap on warm starts.
  if (!metafieldDefsEnsuredInProcess.has(shopDomain)) {
    await ensureMetafieldDefinitions(admin);
    metafieldDefsEnsuredInProcess.add(shopDomain);
  }

  if (shop.seededAt !== null) return;

  // Run scale + table seed inside a single transaction so partial failures
  // don't leave the shop in a half-seeded state.
  await prisma.$transaction(async (tx) => {
    for (const scale of ATELIER_SCALES_V1) {
      await tx.sizeScale.upsert({
        where: {
          shopDomain_sigla: { shopDomain, sigla: scale.sigla },
        },
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
    }

    for (const table of GENERIC_CONVERSION_TABLES_V1) {
      // Only seed if no generic table exists yet for this (shop, scale)
      // pair. We don't rely on a unique constraint because Postgres treats
      // null brand as distinct in UNIQUE.
      const existing = await tx.conversionTable.findFirst({
        where: {
          shopDomain,
          scaleSigla: table.scaleSigla,
          brand: null,
        },
      });
      if (existing !== null) continue;

      await tx.conversionTable.create({
        data: {
          shopDomain,
          scaleSigla: table.scaleSigla,
          brand: null,
          isSeed: true,
          // Prisma JSON columns require InputJsonValue; the ConversionMapping
          // shape is a plain object array so the runtime value is valid JSON,
          // but TS's structural check can't see that without help.
          mappings: table.mappings as never,
        },
      });
    }

    await tx.shop.update({
      where: { shopDomain },
      data: { seededAt: new Date() },
    });
  });
}
