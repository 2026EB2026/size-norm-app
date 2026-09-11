/**
 * Read-only "why didn't this product convert?" tracer.
 *
 * Runs the exact same decision steps as {@link runProcessor} — reusing its
 * exported helpers so the two can't drift — but writes nothing and instead
 * returns a structured trace of every gate, the scale candidates tried, and
 * the per-variant label resolution.
 *
 * Powers the admin Diagnostica page. Also reads the metafields written by
 * previous runs, which is what separates the two failure classes merchants
 * actually hit:
 *   (a) conversion never produced data → fix the product/scale;
 *   (b) data is there but the PDP is empty → the theme block isn't added
 *       to the product template.
 */

import type { PrismaClient } from "@prisma/client";

import { lookupConversion, parseLabel } from "../conversion";
import type { ConversionResult, ConversionTable, SizeScale } from "../conversion";
import {
  getProductForProcessing,
  getProductMetafieldState,
  type Admin,
  type ProductMetafieldState,
} from "../shopify/client";

import {
  inferAgeCategoryFromText,
  inferGenderFromText,
  looksLikeFootwear,
} from "./infer-attributes";
import {
  findSizeOption,
  isFootwear,
  DEFAULT_FOOTWEAR_PRODUCT_TYPES,
  DEFAULT_SIZE_OPTION_NAMES,
} from "./process-product";
import { parseScaleTag, SCALE_TAG_PREFIX } from "./scale-tag";
import {
  atelierFallbackByGender,
  normalizeGender,
  resolveCandidateSigle,
  slugifyBrand,
} from "./index";

/** One variant's label-resolution outcome. */
export interface VariantDiagnosis {
  id: string;
  title: string;
  /** All option name/value pairs, so a wrong option name is visible. */
  options: { name: string; value: string }[];
  /** Value of the option identified as the size, or null when none matched. */
  rawLabel: string | null;
  /** Canonical label after alias/format normalization, or null. */
  canonical: string | null;
  matrix: ConversionResult["matrix"] | null;
  /** Human-readable blocker for this variant, or null when it resolved. */
  problem: string | null;
  /** Whether a size_norm.matrix metafield is currently stored. */
  hasStoredMatrix: boolean;
}

export interface ProductDiagnosis {
  found: true;
  product: {
    id: string;
    numericId: string;
    title: string;
    vendor: string | null;
    productType: string | null;
    tags: string[];
    variantCount: number;
  };
  metafields: {
    gender: string | null;
    scaleSigla: string | null;
    ageCategory: string | null;
  };
  footwear: {
    pass: boolean;
    viaProductType: boolean;
    viaKeywords: boolean;
  };
  gender: {
    fromMetafield: string | null;
    inferred: string | null;
    effective: string | null;
    adoptedFromScale: boolean;
  };
  age: {
    fromMetafield: string | null;
    inferred: string | null;
    effective: string;
  };
  brandSlug: string | null;
  /** Outcome of the ERP's `SCALATAGLIE_<name>` tag, which outranks the
   * vendor+gender auto-derive. */
  scaleTag: {
    raw: string | null;
    normalized: string | null;
    status: "absent" | "resolved" | "out_of_scope" | "unknown" | "ambiguous";
    sigla: string | null;
  };
  /** Each sigla tried, in order, and whether a scale row exists for it.
   * Empty when the tag or the override metafield already resolved. */
  candidates: { sigla: string; found: boolean }[];
  uniqueBrandFallback: {
    attempted: boolean;
    poolSize: number;
    matched: string | null;
  };
  resolvedScale: {
    sigla: string;
    name: string;
    gender: string;
    sourceScale: string;
    labelsCount: number;
    aliasesCount: number;
  } | null;
  tables: {
    count: number;
    totalMappings: number;
    brands: string[];
  };
  variants: VariantDiagnosis[];
  stored: ProductMetafieldState | null;
  /** Ordered, most-important-first list of what to fix. */
  blockers: string[];
  /** Non-blocking observations worth surfacing. */
  notes: string[];
  verdict: "ok" | "partial" | "blocked" | "skipped";
}

export type DiagnoseResult = ProductDiagnosis | { found: false; message: string };

/**
 * Accepts anything a merchant might paste and extracts the numeric product
 * id: a bare number, a product GID, or an admin URL
 * (`.../products/123456?foo=1`). Returns null when no id is recognizable.
 */
export function parseProductIdInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (/^\d+$/.test(trimmed)) return trimmed;
  const gid = /^gid:\/\/shopify\/Product\/(\d+)$/.exec(trimmed);
  if (gid !== null) return gid[1] ?? null;
  // Any URL or path containing /products/<digits>
  const url = /\/products\/(\d+)/.exec(trimmed);
  if (url !== null) return url[1] ?? null;
  return null;
}

type PrismaScaleRow = {
  sigla: string;
  name: string;
  gender: "MEN" | "WOMEN" | "UNISEX" | "KID";
  sourceScale: "US" | "EU" | "UK" | "JP_MM" | "DOUBLE" | "MW_COMBINED";
  labels: unknown;
  aliases: unknown;
};

function toEngineScale(row: PrismaScaleRow): SizeScale {
  return {
    sigla: row.sigla,
    name: row.name,
    gender: row.gender.toLowerCase() as SizeScale["gender"],
    sourceScale: row.sourceScale as SizeScale["sourceScale"],
    labels: (row.labels as string[]) ?? [],
    aliases: (row.aliases as Record<string, string>) ?? {},
  };
}

/**
 * Traces the processing decision for one product without mutating anything.
 */
export async function diagnoseProduct(
  admin: Admin,
  prisma: PrismaClient,
  shopDomain: string,
  productGid: string,
): Promise<DiagnoseResult> {
  let product;
  try {
    product = await getProductForProcessing(admin, productGid);
  } catch (e) {
    return {
      found: false,
      message:
        e instanceof Error
          ? e.message
          : "Prodotto non trovato o non accessibile",
    };
  }

  const blockers: string[] = [];
  const notes: string[] = [];

  // ── Footwear gate ──────────────────────────────────────────────────
  const viaProductType = isFootwear(product, DEFAULT_FOOTWEAR_PRODUCT_TYPES);
  const viaKeywords = looksLikeFootwear(product);
  const footwearPass = viaProductType || viaKeywords;
  if (!footwearPass) {
    blockers.push(
      `Il prodotto non è riconosciuto come calzatura, quindi viene ignorato senza generare alert. Imposta "Tipo prodotto" a uno di: ${DEFAULT_FOOTWEAR_PRODUCT_TYPES.join(", ")} — oppure includi una parola come "scarpa" o "sneakers" nel titolo o nei tag.`,
    );
  }

  // ── Gender / age resolution (mirrors runProcessor) ──────────────────
  const metafieldGender = normalizeGender(product.gender);
  const inferredGender =
    metafieldGender === null ? inferGenderFromText(product) : null;
  let effectiveGender = metafieldGender ?? inferredGender;

  if (
    product.gender !== null &&
    product.gender.trim().length > 0 &&
    metafieldGender === null
  ) {
    blockers.push(
      `Il metafield size_norm.gender contiene "${product.gender}", che non è un valore riconosciuto. Usa men, women, unisex o kid (accettati anche uomo, donna, bambino).`,
    );
  }

  const metafieldAge =
    product.ageCategory !== null && product.ageCategory.trim().length > 0
      ? product.ageCategory.trim().toLowerCase()
      : null;
  const inferredAge =
    metafieldAge === null && effectiveGender === "kid"
      ? inferAgeCategoryFromText(product)
      : null;
  const effectiveAge = metafieldAge ?? inferredAge ?? "adult";

  const brandSlug =
    product.vendor !== null && product.vendor.trim().length > 0
      ? slugifyBrand(product.vendor)
      : null;
  if (brandSlug === null || brandSlug.length === 0) {
    blockers.push(
      "Il prodotto non ha un Vendor (brand). Il brand è la chiave con cui l'app individua la scala ufficiale: impostalo nella scheda prodotto Shopify.",
    );
  }

  // ── ERP scale tag (mirrors runProcessor) ───────────────────────────
  const parsedTag = parseScaleTag(product.tags);
  const scaleTag: ProductDiagnosis["scaleTag"] = {
    raw: null,
    normalized: null,
    status: "absent",
    sigla: null,
  };
  let scale: SizeScale | null = null;

  if (parsedTag.kind === "out_of_scope") {
    scaleTag.raw = parsedTag.raw;
    scaleTag.status = "out_of_scope";
    blockers.push(
      `Il tag ${SCALE_TAG_PREFIX}${parsedTag.raw} indica una scala ritirata (prefisso "x"): il prodotto viene ignorato senza generare alert.`,
    );
  } else if (parsedTag.kind === "ambiguous") {
    scaleTag.raw = parsedTag.raws.join(", ");
    scaleTag.status = "ambiguous";
    blockers.push(
      `Il prodotto ha più tag ${SCALE_TAG_PREFIX} in conflitto (${parsedTag.raws.join(", ")}). Lasciane uno solo.`,
    );
  } else if (parsedTag.kind === "value") {
    scaleTag.raw = parsedTag.raw;
    scaleTag.normalized = parsedTag.normalized;
    const tagRow = await prisma.sizeScale.findUnique({
      where: {
        shopDomain_tagValue: { shopDomain, tagValue: parsedTag.normalized },
      },
    });
    if (tagRow === null) {
      scaleTag.status = "unknown";
      blockers.push(
        `Il tag ${SCALE_TAG_PREFIX}${parsedTag.raw} non corrisponde a nessuna scala configurata. Crea la scala oppure collegala a questo valore dalla pagina Scale Taglie.`,
      );
    } else {
      scaleTag.status = "resolved";
      scaleTag.sigla = tagRow.sigla;
      scale = toEngineScale(tagRow as PrismaScaleRow);
    }
  }

  // ── Explicit override metafield (outranks the tag) ─────────────────
  if (product.scaleSigla !== null && product.scaleSigla.trim().length > 0) {
    const overrideRow = await prisma.sizeScale.findUnique({
      where: {
        shopDomain_sigla: { shopDomain, sigla: product.scaleSigla.trim() },
      },
    });
    if (overrideRow !== null) scale = toEngineScale(overrideRow as PrismaScaleRow);
  }

  const scaleFromExplicitSignal = scale !== null;

  // ── Scale candidates ───────────────────────────────────────────────
  const candidates: { sigla: string; found: boolean }[] = [];
  if (scale === null) {
    const candidateSigle = resolveCandidateSigle({
      vendor: product.vendor,
      scaleSigla: product.scaleSigla,
      gender: effectiveGender,
      age: effectiveAge,
    });
    for (const sigla of candidateSigle) {
      const row = await prisma.sizeScale.findUnique({
        where: { shopDomain_sigla: { shopDomain, sigla } },
      });
      const found = row !== null;
      candidates.push({ sigla, found });
      if (found && scale === null) {
        scale = toEngineScale(row as PrismaScaleRow);
      }
    }
  }

  // ── Unique-brand fallback ──────────────────────────────────────────
  const uniqueBrandFallback = {
    attempted: false,
    poolSize: 0,
    matched: null as string | null,
  };
  if (scale === null && brandSlug !== null && brandSlug.length > 0) {
    uniqueBrandFallback.attempted = true;
    const brandScales = await prisma.sizeScale.findMany({
      where: { shopDomain, sigla: { startsWith: `${brandSlug}-` } },
    });
    const forAge = brandScales.filter((s) =>
      s.sigla.endsWith(`-${effectiveAge}`),
    );
    const pool = forAge.length > 0 ? forAge : brandScales;
    uniqueBrandFallback.poolSize = pool.length;
    if (pool.length === 1) {
      scale = toEngineScale(pool[0] as PrismaScaleRow);
      uniqueBrandFallback.matched = scale.sigla;
    } else if (pool.length === 0) {
      blockers.push(
        `Nessuna scala trovata per il brand "${product.vendor}". Verifica che il nome del Vendor corrisponda a un brand supportato, oppure crea una scala personalizzata e assegnala col metafield size_norm.scale_sigla.`,
      );
    } else {
      blockers.push(
        `Il brand "${product.vendor}" ha ${pool.length} scale possibili e non è stato possibile scegliere: manca il gender. Aggiungi il metafield size_norm.gender oppure includi uomo/donna/kids nel titolo o nei tag.`,
      );
    }
  }

  const adoptedFromScale =
    scale !== null && (scaleFromExplicitSignal || effectiveGender === null);
  if (adoptedFromScale && scale !== null) {
    effectiveGender = scale.gender;
  }

  if (scale === null && !uniqueBrandFallback.attempted) {
    blockers.push(
      "Nessuna scala taglie risolta: senza brand non è possibile derivarla automaticamente.",
    );
  }

  if (effectiveGender === null && scale === null) {
    blockers.push(
      "Gender non determinato: nessun metafield e nessuna parola chiave (uomo/donna/unisex/bambino) in titolo, tag o tipo prodotto.",
    );
  }

  // ── Conversion tables ──────────────────────────────────────────────
  let tables: ConversionTable[] = [];
  if (scale !== null) {
    const rows = await prisma.conversionTable.findMany({
      where: { shopDomain, scaleSigla: scale.sigla },
    });
    tables = rows.map((r) => ({
      scaleSigla: r.scaleSigla,
      brand: r.brand,
      isSeed: r.isSeed,
      mappings: (r.mappings as unknown as ConversionTable["mappings"]) ?? [],
    }));
    if (tables.length === 0) {
      blockers.push(
        `La scala ${scale.sigla} esiste ma non ha nessuna Conversion Table: senza tabella non c'è nulla da convertire.`,
      );
    }
  }

  // ── Gender consistency (same rule as validateGenderMatch) ──────────
  if (
    scale !== null &&
    effectiveGender !== null &&
    scale.gender !== "unisex" &&
    scale.gender !== "kid" &&
    effectiveGender !== scale.gender
  ) {
    blockers.push(
      `Incoerenza gender: il prodotto è "${effectiveGender}" ma la scala ${scale.sigla} è "${scale.gender}". Il prodotto verrebbe messo in Draft con un alert GENDER_MISMATCH.`,
    );
  }

  // ── Per-variant resolution ─────────────────────────────────────────
  let storedState: ProductMetafieldState | null = null;
  try {
    storedState = await getProductMetafieldState(admin, product.id);
  } catch {
    // Diagnostics must never fail because of the optional extra query.
    storedState = null;
  }

  const variants: VariantDiagnosis[] = product.variants.map((v) => {
    const rawLabel = findSizeOption(v, DEFAULT_SIZE_OPTION_NAMES);
    const hasStoredMatrix = storedState?.variantsWithMatrix[v.id] === true;

    if (rawLabel === null) {
      return {
        id: v.id,
        title: v.title,
        options: v.selectedOptions,
        rawLabel: null,
        canonical: null,
        matrix: null,
        problem: `Nessuna opzione "${DEFAULT_SIZE_OPTION_NAMES.join(" / ")}" su questa variante`,
        hasStoredMatrix,
      };
    }
    if (scale === null) {
      return {
        id: v.id,
        title: v.title,
        options: v.selectedOptions,
        rawLabel,
        canonical: null,
        matrix: null,
        problem: "Scala non risolta (vedi sopra)",
        hasStoredMatrix,
      };
    }

    const normalized = parseLabel(rawLabel, scale);
    if (normalized === null) {
      return {
        id: v.id,
        title: v.title,
        options: v.selectedOptions,
        rawLabel,
        canonical: null,
        matrix: null,
        problem: `Etichetta "${rawLabel}" non riconosciuta nella scala ${scale.sigla}`,
        hasStoredMatrix,
      };
    }

    const conversion = lookupConversion(
      scale.sigla,
      product.vendor,
      normalized.canonical,
      tables,
    );
    if (conversion === null) {
      return {
        id: v.id,
        title: v.title,
        options: v.selectedOptions,
        rawLabel,
        canonical: normalized.canonical,
        matrix: null,
        problem: `Nessun mapping per "${normalized.canonical}" nelle tabelle di ${scale.sigla}`,
        hasStoredMatrix,
      };
    }

    return {
      id: v.id,
      title: v.title,
      options: v.selectedOptions,
      rawLabel,
      canonical: normalized.canonical,
      matrix: conversion.matrix,
      problem: null,
      hasStoredMatrix,
    };
  });

  // ── Verdict + theme hint ───────────────────────────────────────────
  const resolvedCount = variants.filter((v) => v.problem === null).length;
  let verdict: ProductDiagnosis["verdict"];
  if (!footwearPass) {
    verdict = "skipped";
  } else if (resolvedCount === 0) {
    verdict = "blocked";
  } else if (resolvedCount < variants.length) {
    verdict = "partial";
  } else {
    verdict = "ok";
  }

  if (variants.length === 0) {
    blockers.push(
      "Il prodotto non ha varianti: non c'è nessuna taglia da convertire.",
    );
  } else if (
    variants.length === 1 &&
    variants[0]?.options.length === 1 &&
    variants[0]?.options[0]?.value === "Default Title"
  ) {
    blockers.push(
      'Il prodotto ha solo la variante "Default Title": non esiste un\'opzione taglia. Aggiungi un\'opzione "Taglia" (o "Size") con le misure reali.',
    );
  }

  const storedMatrixCount = variants.filter((v) => v.hasStoredMatrix).length;
  if (verdict === "ok" && storedMatrixCount === variants.length) {
    notes.push(
      "Le conversioni sono calcolate e già salvate nei metafield. Se la PDP è ancora vuota il problema è nel theme: apri Personalizza tema → pagina prodotto e verifica che il blocco “Size Norm — Sizes” sia stato aggiunto.",
    );
  } else if (storedMatrixCount > 0 && storedMatrixCount < variants.length) {
    notes.push(
      `${storedMatrixCount} varianti su ${variants.length} hanno già dati salvati da un run precedente.`,
    );
  } else if (storedMatrixCount === 0 && verdict === "ok") {
    notes.push(
      "La conversione andrebbe a buon fine ma non risulta ancora salvata: lancia un Bulk re-scan per scrivere i metafield.",
    );
  }

  return {
    found: true,
    product: {
      id: product.id,
      numericId: product.id.split("/").pop() ?? product.id,
      title: product.title,
      vendor: product.vendor,
      productType: product.productType,
      tags: product.tags,
      variantCount: product.variants.length,
    },
    metafields: {
      gender: product.gender,
      scaleSigla: product.scaleSigla,
      ageCategory: product.ageCategory,
    },
    footwear: { pass: footwearPass, viaProductType, viaKeywords },
    gender: {
      fromMetafield: metafieldGender,
      inferred: inferredGender,
      effective: effectiveGender,
      adoptedFromScale,
    },
    age: {
      fromMetafield: metafieldAge,
      inferred: inferredAge,
      effective: effectiveAge,
    },
    brandSlug,
    candidates,
    scaleTag,
    uniqueBrandFallback,
    resolvedScale:
      scale === null
        ? null
        : {
            sigla: scale.sigla,
            name: scale.name,
            gender: scale.gender,
            sourceScale: scale.sourceScale,
            labelsCount: scale.labels.length,
            aliasesCount: Object.keys(scale.aliases).length,
          },
    tables: {
      count: tables.length,
      totalMappings: tables.reduce((n, t) => n + t.mappings.length, 0),
      brands: tables.map((t) => t.brand ?? "generic"),
    },
    variants,
    stored: storedState,
    blockers,
    notes,
    verdict,
  };
}

/** Re-exported so the route can label the Atelier fallback in the trace. */
export { atelierFallbackByGender };
