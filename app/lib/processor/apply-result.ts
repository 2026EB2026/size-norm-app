/**
 * Side-effecting wrapper around {@link processProduct}: takes the result and
 * issues the appropriate Shopify mutations + Prisma writes (alerts).
 *
 * Used by webhook handlers and the bulk job (M5).
 */

import { createHash } from "node:crypto";

import {
  setMetafields,
  updateProductStatusAndTags,
  type Admin,
  type MetafieldWrite,
  type ShopifyProduct,
} from "../shopify/client";
import type { PrismaClient } from "@prisma/client";

import {
  SIZE_NORM_ERROR_TAG,
  type ProcessingResult,
} from "./process-product";

/**
 * Builds a SHA-256 hash of the fields that the processor reads. Used by
 * `products/update` webhook to skip when nothing relevant changed.
 */
export function computeProductHash(product: ShopifyProduct): string {
  const payload = JSON.stringify({
    vendor: product.vendor ?? "",
    productType: product.productType ?? "",
    gender: product.gender ?? "",
    scaleSigla: product.scaleSigla ?? "",
    ageCategory: product.ageCategory ?? "",
    variants: product.variants
      .map((v) => ({
        id: v.id,
        opts: v.selectedOptions.map((o) => ({ n: o.name, v: o.value })),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Computes the new tag list after applying add/remove deltas. Order is
 * stable (preserves existing order, appends adds).
 */
export function applyTagDelta(
  current: string[],
  toAdd: string[],
  toRemove: string[],
): string[] {
  const out = current.filter((t) => !toRemove.includes(t));
  for (const t of toAdd) {
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/**
 * Applies a ProcessingResult to Shopify + Prisma. Idempotent w.r.t. alerts:
 * unresolved alerts for the same product are deleted before new ones are
 * inserted, so each processing run replaces the alert set.
 *
 * Throws on Shopify or Prisma errors so the webhook handler can return
 * a 500 and Shopify will retry.
 */
export async function applyProcessingResult(
  admin: Admin,
  prisma: PrismaClient,
  shopDomain: string,
  product: ShopifyProduct,
  result: ProcessingResult,
): Promise<void> {
  if (result.kind === "skip") return;

  // 1. Variant metafield writes (success + draft both write the variants
  //    that resolved successfully). TS has narrowed `result.kind` to
  //    "success" | "draft" by here so `variantWrites` is always present.
  const variantWrites = result.variantWrites;
  const metafieldWrites: MetafieldWrite[] = [];

  for (const w of variantWrites) {
    if (w.matrix.us !== null) {
      metafieldWrites.push({
        ownerId: w.variantId,
        namespace: "size_norm",
        key: "us",
        type: "single_line_text_field",
        value: w.matrix.us,
      });
    }
    if (w.matrix.eu !== null) {
      metafieldWrites.push({
        ownerId: w.variantId,
        namespace: "size_norm",
        key: "eu",
        type: "single_line_text_field",
        value: w.matrix.eu,
      });
    }
    if (w.matrix.uk !== null) {
      metafieldWrites.push({
        ownerId: w.variantId,
        namespace: "size_norm",
        key: "uk",
        type: "single_line_text_field",
        value: w.matrix.uk,
      });
    }
    if (w.matrix.jpMm !== null) {
      metafieldWrites.push({
        ownerId: w.variantId,
        namespace: "size_norm",
        key: "jp_mm",
        type: "number_integer",
        value: String(w.matrix.jpMm),
      });
    }
    metafieldWrites.push({
      ownerId: w.variantId,
      namespace: "size_norm",
      key: "matrix",
      type: "json",
      value: JSON.stringify(w.matrix),
    });
    metafieldWrites.push({
      ownerId: w.variantId,
      namespace: "size_norm",
      key: "source_label",
      type: "single_line_text_field",
      value: w.sourceLabel,
    });
  }

  // 2. Product-level status metafields.
  if (result.kind === "success") {
    metafieldWrites.push({
      ownerId: product.id,
      namespace: "size_norm",
      key: "conversion_status",
      type: "single_line_text_field",
      value: "ok",
    });
    metafieldWrites.push({
      ownerId: product.id,
      namespace: "size_norm",
      key: "last_processed_at",
      type: "date_time",
      value: new Date().toISOString(),
    });
  } else if (result.kind === "draft") {
    metafieldWrites.push({
      ownerId: product.id,
      namespace: "size_norm",
      key: "conversion_status",
      type: "single_line_text_field",
      value: "error",
    });
    metafieldWrites.push({
      ownerId: product.id,
      namespace: "size_norm",
      key: "last_processed_at",
      type: "date_time",
      value: new Date().toISOString(),
    });
  }

  // 3. Write metafields in one batch.
  if (metafieldWrites.length > 0) {
    await setMetafields(admin, metafieldWrites);
  }

  // 4. Status + tags update.
  const newTags = applyTagDelta(product.tags, result.tagsToAdd, result.tagsToRemove);
  await updateProductStatusAndTags(admin, product.id, {
    status: result.kind === "success" ? "ACTIVE" : "DRAFT",
    tags: newTags,
  });

  // 5. Alerts: replace the unresolved set for this product.
  await prisma.conversionAlert.deleteMany({
    where: {
      shopDomain,
      productId: product.id,
      resolvedAt: null,
    },
  });

  if (result.kind === "draft") {
    const toInsert: {
      shopDomain: string;
      productId: string;
      variantId: string | null;
      errorCode: string;
      errorMessage: string;
      payload: never;
    }[] = [];
    if (result.productAlert !== undefined) {
      toInsert.push({
        shopDomain,
        productId: product.id,
        variantId: null,
        errorCode: result.productAlert.errorCode,
        errorMessage: result.productAlert.errorMessage,
        payload: (result.productAlert.payload ?? {}) as never,
      });
    }
    for (const a of result.variantAlerts) {
      toInsert.push({
        shopDomain,
        productId: product.id,
        variantId: a.variantId ?? null,
        errorCode: a.errorCode,
        errorMessage: a.errorMessage,
        payload: (a.payload ?? {}) as never,
      });
    }
    if (toInsert.length > 0) {
      await prisma.conversionAlert.createMany({ data: toInsert });
    }
  }

  // 6. Update the product snapshot hash to suppress redundant webhook
  //    processing on `products/update` for unrelated edits.
  const newHash = computeProductHash(product);
  await prisma.productSnapshot.upsert({
    where: { shopDomain_productId: { shopDomain, productId: product.id } },
    create: { shopDomain, productId: product.id, hash: newHash },
    update: { hash: newHash },
  });
}

/** Sentinel value returned by {@link shouldProcessProduct}. */
export type ProcessingDecision = "process" | "skip-unchanged";

/**
 * Checks the stored hash for this product and decides whether to run
 * processProduct. Returns "skip-unchanged" only if a snapshot exists AND its
 * hash matches the current product state.
 */
export async function shouldProcessProduct(
  prisma: PrismaClient,
  shopDomain: string,
  product: ShopifyProduct,
): Promise<ProcessingDecision> {
  const snap = await prisma.productSnapshot.findUnique({
    where: { shopDomain_productId: { shopDomain, productId: product.id } },
  });
  if (snap === null) return "process";
  const currentHash = computeProductHash(product);
  return currentHash === snap.hash ? "skip-unchanged" : "process";
}

/** Re-export the tag constant so webhook handlers and tests share the symbol. */
export { SIZE_NORM_ERROR_TAG };
