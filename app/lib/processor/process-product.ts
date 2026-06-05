/**
 * Pure-ish product processor.
 *
 * Given a fetched Shopify product + the merchant's DB state (scale + tables),
 * decides what to do: skip (not footwear), write metafields (success), or
 * draft+alert (any of several failure modes per section 3.6 of the project
 * handover).
 *
 * The processor does NOT call Shopify or Prisma. The caller (webhook handler
 * or bulk job) is responsible for executing the mutations and persisting
 * alerts.
 */

import {
  lookupConversion,
  parseLabel,
  validateGenderMatch,
} from "../conversion";
import type {
  ConversionErrorCode,
  ConversionResult,
  ConversionTable,
  Gender,
  SizeScale,
} from "../conversion";

/** Tag added to products that finished processing with an error. */
export const SIZE_NORM_ERROR_TAG = "size-norm:error";

/**
 * Default list of `product.product_type` strings that we treat as footwear.
 * Case-insensitive matching. The merchant can override this in M5.
 */
export const DEFAULT_FOOTWEAR_PRODUCT_TYPES: readonly string[] = [
  "Shoes",
  "Sneakers",
  "Boots",
  "Footwear",
  "Calzature",
  "Scarpe",
] as const;

/**
 * Default list of variant option names that hold the size value. The
 * processor picks the first matching option (case-insensitive).
 */
export const DEFAULT_SIZE_OPTION_NAMES: readonly string[] = [
  "Size",
  "Taglia",
  "Misura",
] as const;

/** Input to the processor. Shaped to avoid coupling with Shopify types. */
export interface ProcessorInput {
  product: {
    id: string;
    vendor: string | null;
    productType: string | null;
    tags: string[];
    gender: string | null;
    scaleSigla: string | null;
    variants: {
      id: string;
      title: string;
      selectedOptions: { name: string; value: string }[];
    }[];
  };
  /**
   * Pre-loaded by the caller from DB: the SizeScale referenced by the
   * product's `scale_sigla` metafield, or `null` if not found.
   */
  scale: SizeScale | null;
  /**
   * Pre-loaded by the caller: all conversion tables for that scale (generic
   * + brand-specific). Empty array is fine; lookupConversion will return null.
   */
  tables: ConversionTable[];
  /**
   * Override the footwear product-type list. Defaults to
   * {@link DEFAULT_FOOTWEAR_PRODUCT_TYPES}.
   */
  footwearProductTypes?: readonly string[];
  /**
   * Override the size option name list. Defaults to
   * {@link DEFAULT_SIZE_OPTION_NAMES}.
   */
  sizeOptionNames?: readonly string[];
}

/** What we want to write back to one variant. */
export interface VariantMetafieldWrite {
  variantId: string;
  sourceLabel: string;
  matrix: ConversionResult["matrix"];
}

/** An alert row to create when something went wrong. */
export interface AlertEmission {
  errorCode: ConversionErrorCode;
  errorMessage: string;
  variantId?: string;
  payload?: Record<string, unknown>;
}

/** Final processing outcome. */
export type ProcessingResult =
  | {
      kind: "skip";
      reason: string;
    }
  | {
      kind: "success";
      variantWrites: VariantMetafieldWrite[];
      /** Tags to add (e.g. nothing) and remove (e.g. error tag if it was set). */
      tagsToAdd: string[];
      tagsToRemove: string[];
    }
  | {
      kind: "draft";
      /**
       * Product-level alert (only set when failure is product-level: missing
       * metafield, gender mismatch, scale-not-found). When this is set,
       * `variantAlerts` is empty.
       */
      productAlert?: AlertEmission;
      /**
       * Per-variant alerts (label not recognized, mapping not found). The
       * product is set to draft even if only one variant fails.
       */
      variantAlerts: AlertEmission[];
      tagsToAdd: string[];
      tagsToRemove: string[];
      /** Whatever variants resolved before the failure; written anyway. */
      variantWrites: VariantMetafieldWrite[];
    };

/**
 * Maps the Prisma Gender enum value back to the lowercase form the
 * conversion engine uses.
 */
function toEngineGender(prismaGender: SizeScale["gender"]): Gender {
  // Already lowercase in our types — defensive cast.
  return prismaGender;
}

function isFootwear(
  product: ProcessorInput["product"],
  whitelist: readonly string[],
): boolean {
  if (product.productType === null) return false;
  const lower = product.productType.toLowerCase();
  return whitelist.some((t) => t.toLowerCase() === lower);
}

function findSizeOption(
  variant: ProcessorInput["product"]["variants"][number],
  optionNames: readonly string[],
): string | null {
  for (const opt of variant.selectedOptions) {
    if (optionNames.some((n) => n.toLowerCase() === opt.name.toLowerCase())) {
      return opt.value;
    }
  }
  return null;
}

/**
 * Returns the same tag list with `SIZE_NORM_ERROR_TAG` ensured present
 * (or absent). Idempotent.
 */
function tagsAfter(
  current: string[],
  shouldHaveError: boolean,
): { add: string[]; remove: string[] } {
  const hasError = current.includes(SIZE_NORM_ERROR_TAG);
  if (shouldHaveError && !hasError) return { add: [SIZE_NORM_ERROR_TAG], remove: [] };
  if (!shouldHaveError && hasError) return { add: [], remove: [SIZE_NORM_ERROR_TAG] };
  return { add: [], remove: [] };
}

export function processProduct(input: ProcessorInput): ProcessingResult {
  const {
    product,
    scale,
    tables,
    footwearProductTypes = DEFAULT_FOOTWEAR_PRODUCT_TYPES,
    sizeOptionNames = DEFAULT_SIZE_OPTION_NAMES,
  } = input;

  // 1. Footwear gate. Non-footwear products are silently skipped.
  if (!isFootwear(product, footwearProductTypes)) {
    return { kind: "skip", reason: "not_footwear" };
  }

  // 2. Required product metafields. `gender` is always required; `scaleSigla`
  // is OPTIONAL because the orchestrator auto-derives a sigla from
  // vendor + gender + age_category and falls back to Atelier scales. If
  // nothing resolves, we'll catch it at step 3 (scale === null).
  if (product.gender === null || product.gender.trim().length === 0) {
    const tags = tagsAfter(product.tags, true);
    return {
      kind: "draft",
      productAlert: {
        errorCode: "MISSING_METAFIELD",
        errorMessage: `Metadati prodotto mancanti: size_norm.gender`,
        payload: { missing: ["size_norm.gender"] },
      },
      variantAlerts: [],
      tagsToAdd: tags.add,
      tagsToRemove: tags.remove,
      variantWrites: [],
    };
  }

  // 3. The orchestrator must have resolved a scale (via metafield, brand
  // auto-derive, or Atelier fallback). If still null, nothing matched.
  if (scale === null) {
    const tags = tagsAfter(product.tags, true);
    const explicitSigla = product.scaleSigla?.trim() ?? "";
    const errorMessage =
      explicitSigla.length > 0
        ? `Scala "${explicitSigla}" non trovata nel sistema`
        : `Nessuna scala trovata per vendor "${product.vendor ?? "—"}" + gender "${product.gender}". Setta size_norm.scale_sigla manualmente oppure crea la scala brand-specifica.`;
    return {
      kind: "draft",
      productAlert: {
        errorCode: "TABLE_NOT_FOUND",
        errorMessage,
        payload: {
          scaleSigla: explicitSigla.length > 0 ? explicitSigla : null,
          vendor: product.vendor,
          gender: product.gender,
        },
      },
      variantAlerts: [],
      tagsToAdd: tags.add,
      tagsToRemove: tags.remove,
      variantWrites: [],
    };
  }

  // 4. Gender consistency between product metafield and scale.
  const productGender = (product.gender ?? "").trim().toLowerCase() as Gender;
  const validGender =
    productGender === "men" ||
    productGender === "women" ||
    productGender === "unisex" ||
    productGender === "kid";
  if (!validGender) {
    const tags = tagsAfter(product.tags, true);
    return {
      kind: "draft",
      productAlert: {
        errorCode: "MISSING_METAFIELD",
        errorMessage: `Valore gender non valido: "${product.gender}". Atteso men/women/unisex/kid.`,
        payload: { gender: product.gender },
      },
      variantAlerts: [],
      tagsToAdd: tags.add,
      tagsToRemove: tags.remove,
      variantWrites: [],
    };
  }
  if (!validateGenderMatch(productGender, toEngineGender(scale.gender))) {
    const tags = tagsAfter(product.tags, true);
    return {
      kind: "draft",
      productAlert: {
        errorCode: "GENDER_MISMATCH",
        errorMessage: `Scala ${scale.sigla} dichiara gender "${scale.gender}" ma il prodotto ha gender "${productGender}"`,
        payload: {
          productGender,
          scaleGender: scale.gender,
          scaleSigla: scale.sigla,
        },
      },
      variantAlerts: [],
      tagsToAdd: tags.add,
      tagsToRemove: tags.remove,
      variantWrites: [],
    };
  }

  // 5. Process each variant.
  const variantWrites: VariantMetafieldWrite[] = [];
  const variantAlerts: AlertEmission[] = [];

  for (const v of product.variants) {
    const rawLabel = findSizeOption(v, sizeOptionNames);
    if (rawLabel === null) {
      variantAlerts.push({
        errorCode: "LABEL_NOT_RECOGNIZED",
        errorMessage: `Variante "${v.title}" non ha un'opzione "Size/Taglia/Misura"`,
        variantId: v.id,
        payload: { selectedOptions: v.selectedOptions },
      });
      continue;
    }

    const normalized = parseLabel(rawLabel, scale);
    if (normalized === null) {
      variantAlerts.push({
        errorCode: "LABEL_NOT_RECOGNIZED",
        errorMessage: `Etichetta "${rawLabel}" non riconosciuta nella scala ${scale.sigla}`,
        variantId: v.id,
        payload: { rawLabel, scaleSigla: scale.sigla },
      });
      continue;
    }

    const conversion = lookupConversion(
      scale.sigla,
      product.vendor,
      normalized.canonical,
      tables,
    );
    if (conversion === null) {
      variantAlerts.push({
        errorCode: "MAPPING_NOT_FOUND",
        errorMessage: `Nessuna conversion table copre "${normalized.canonical}" per scala ${scale.sigla} (brand "${product.vendor ?? "—"}")`,
        variantId: v.id,
        payload: {
          rawLabel,
          canonical: normalized.canonical,
          scaleSigla: scale.sigla,
          brand: product.vendor,
        },
      });
      continue;
    }

    variantWrites.push({
      variantId: v.id,
      sourceLabel: normalized.canonical,
      matrix: conversion.matrix,
    });
  }

  // 6. Build the outcome.
  if (variantAlerts.length > 0) {
    const tags = tagsAfter(product.tags, true);
    return {
      kind: "draft",
      variantAlerts,
      tagsToAdd: tags.add,
      tagsToRemove: tags.remove,
      // Write the variants that DID resolve — partial success is useful to
      // the storefront and reduces the work the merchant has to redo.
      variantWrites,
    };
  }

  const tags = tagsAfter(product.tags, false);
  return {
    kind: "success",
    variantWrites,
    tagsToAdd: tags.add,
    tagsToRemove: tags.remove,
  };
}
