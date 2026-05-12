import {
  ATELIER_SCALES_V1,
  GENERIC_CONVERSION_TABLES_V1,
} from "../conversion";
import type { Gender, SourceScale } from "../conversion";
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
 * Idempotent first-install seed.
 *
 * On the first authenticated visit by a merchant, this:
 *   1. Upserts the `Shop` row (so `installedAt` is recorded).
 *   2. If `Shop.seededAt` is null, inserts the 28 V1 `SizeScale` rows and the
 *      28 generic `ConversionTable` rows from the conversion engine's seed.
 *   3. Sets `Shop.seededAt = now()` so subsequent calls are no-ops.
 *
 * Safe to call on every page load — the `seededAt` check makes it O(1) after
 * the first call.
 *
 * Called from `app/routes/app.tsx` loader.
 */
export async function ensureSeed(shopDomain: string): Promise<void> {
  const shop = await prisma.shop.upsert({
    where: { shopDomain },
    create: { shopDomain },
    update: {},
  });

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
