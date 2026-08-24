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

/** The product mutation a processing run should apply. */
export interface ProductStatusPatch {
  /** Omitted entirely when safe mode is on — status is left untouched. */
  status?: "ACTIVE" | "DRAFT" | "ARCHIVED";
  tags: string[];
}

/**
 * Decides what to write back to the product itself.
 *
 * Tags always travel: the `size-norm:error` tag is how merchants filter
 * broken products in the Shopify admin, and it's non-destructive.
 *
 * Status is different. Forcing it is genuinely useful on a curated catalogue
 * — a shoe whose size table is wrong shouldn't be buyable — but on a large
 * live store the same rule unpublishes sellable products and publishes ones
 * the merchant was still preparing. So it's opt-in per shop
 * (`Shop.manageProductStatus`), and when off we simply omit the field.
 */
export function resolveProductStatusPatch(
  resultKind: "success" | "draft",
  currentTags: string[],
  tagsToAdd: string[],
  tagsToRemove: string[],
  manageProductStatus: boolean,
): ProductStatusPatch {
  const tags = applyTagDelta(currentTags, tagsToAdd, tagsToRemove);
  if (!manageProductStatus) return { tags };
  return { status: resultKind === "success" ? "ACTIVE" : "DRAFT", tags };
}

/**
 * Slugifies a vendor string to match the convention used by the per-brand
 * settings UI (lowercase, dashes, trimmed). Keep in sync with
 * `app/lib/processor/index.ts:slugifyBrand`.
 */
function slugifyBrand(vendor: string): string {
  return vendor
    .toLowerCase()
    .trim()
    .replace(/\s+kids$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The per-shop settings a processing run needs. */
export interface ShopProcessingSettings {
  /** Record<brand-slug, display scale>, or null when unset. */
  brandDisplayScales: Record<string, unknown> | null;
  manageProductStatus: boolean;
}

/**
 * Reads the settings one processing run depends on, in a single query.
 * Falls back to the safe defaults when the shop row is missing (which can
 * happen if a webhook races ahead of the first authenticated visit).
 */
export async function readShopProcessingSettings(
  prisma: PrismaClient,
  shopDomain: string,
): Promise<ShopProcessingSettings> {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { brandDisplayScales: true, manageProductStatus: true },
  });
  if (shop === null) {
    return { brandDisplayScales: null, manageProductStatus: false };
  }
  return {
    brandDisplayScales: shop.brandDisplayScales as Record<
      string,
      unknown
    > | null,
    manageProductStatus: shop.manageProductStatus,
  };
}

/**
 * Resolves the merchant's per-brand display-scale rule for the given vendor.
 * Returns the scale as a string (e.g. "EU"), or the empty string when no
 * rule applies — the theme extension reads the empty string as "fall back to
 * the block's default_scale".
 */
export function resolveBrandDisplayScale(
  brandDisplayScales: Record<string, unknown> | null,
  vendor: string | null,
): string {
  if (vendor === null || vendor.trim().length === 0) return "";
  if (brandDisplayScales === null) return "";
  const brand = slugifyBrand(vendor);
  if (brand.length === 0) return "";
  const value = brandDisplayScales[brand];
  if (typeof value !== "string" || value.trim().length === 0) return "";
  return value.trim();
}

/**
 * Builds a SHA-256 hash of the fields that the processor reads. Used by
 * `products/update` webhook to skip when nothing relevant changed.
 *
 * Includes title and tags because the attribute-inference layer reads
 * them (gender/age/footwear keywords) — editing "Sneakers prova" into
 * "Sneakers prova donna" must re-trigger processing.
 */
export function computeProductHash(product: ShopifyProduct): string {
  const payload = JSON.stringify({
    title: product.title ?? "",
    vendor: product.vendor ?? "",
    productType: product.productType ?? "",
    tags: [...product.tags].sort(),
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
    if (w.matrix.cm !== null) {
      metafieldWrites.push({
        ownerId: w.variantId,
        namespace: "size_norm",
        key: "cm",
        type: "single_line_text_field",
        value: w.matrix.cm,
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

  // 2b. Per-brand display-scale override. If the merchant has configured a
  //     display scale for this product's vendor in Shop.brandDisplayScales,
  //     write it to the product metafield `size_norm.display_scale` so the
  //     theme extension can pick it up at render time. We deliberately
  //     write the metafield even if the brand isn't in the map — using the
  //     empty string in that case — so previously-set values get cleared
  //     when the merchant removes a brand rule.
  const settings = await readShopProcessingSettings(prisma, shopDomain);
  const displayScaleValue = resolveBrandDisplayScale(
    settings.brandDisplayScales,
    product.vendor,
  );
  metafieldWrites.push({
    ownerId: product.id,
    namespace: "size_norm",
    key: "display_scale",
    type: "single_line_text_field",
    value: displayScaleValue,
  });

  // 3. Write metafields in one batch.
  if (metafieldWrites.length > 0) {
    await setMetafields(admin, metafieldWrites);
  }

  // 4. Tags always; status only when the merchant opted in (see
  //    resolveProductStatusPatch — safe mode is the default).
  const patch = resolveProductStatusPatch(
    result.kind,
    product.tags,
    result.tagsToAdd,
    result.tagsToRemove,
    settings.manageProductStatus,
  );
  await updateProductStatusAndTags(admin, product.id, patch);

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
