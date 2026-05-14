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

  // Load scale + tables from DB (only when sigla is present — the processor
  // handles `scale === null` to emit a SCALE_NOT_FOUND alert).
  let scale: SizeScale | null = null;
  let tables: ConversionTable[] = [];
  if (product.scaleSigla !== null && product.scaleSigla.length > 0) {
    const scaleRow = await prisma.sizeScale.findUnique({
      where: {
        shopDomain_sigla: { shopDomain, sigla: product.scaleSigla },
      },
    });
    if (scaleRow !== null) {
      scale = prismaScaleToEngine(scaleRow);
      const tableRows = await prisma.conversionTable.findMany({
        where: { shopDomain, scaleSigla: scaleRow.sigla },
      });
      tables = tableRows.map(prismaTableToEngine);
    }
  }

  const result = processProduct({ product, scale, tables });
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
