import { describe, expect, it } from "vitest";

import {
  processProduct,
  SIZE_NORM_ERROR_TAG,
} from "../../app/lib/processor/process-product";
import type { ProcessorInput } from "../../app/lib/processor/process-product";
import {
  ATELIER_SCALES_BY_SIGLA,
  GENERIC_CONVERSION_TABLES_V1,
} from "../../app/lib/conversion";
import type { ConversionTable } from "../../app/lib/conversion";

function scale(sigla: string) {
  const s = ATELIER_SCALES_BY_SIGLA.get(sigla);
  if (s === undefined) throw new Error(`scale ${sigla} not in seed`);
  return s;
}

function tablesFor(sigla: string): ConversionTable[] {
  return GENERIC_CONVERSION_TABLES_V1.filter((t) => t.scaleSigla === sigla);
}

/** Builds a minimal product input. */
function product(
  overrides: Partial<ProcessorInput["product"]> = {},
): ProcessorInput["product"] {
  return {
    id: "gid://shopify/Product/1",
    vendor: null,
    productType: "Shoes",
    tags: [],
    gender: "men",
    scaleSigla: "G",
    variants: [],
    ...overrides,
  };
}

function input(
  productOverrides: Partial<ProcessorInput["product"]> = {},
  scaleArg = scale("G"),
  tables = tablesFor("G"),
): ProcessorInput {
  return { product: product(productOverrides), scale: scaleArg, tables };
}

describe("processProduct — skip when not footwear", () => {
  it("skips when productType is unknown", () => {
    const r = processProduct(input({ productType: "T-Shirt" }));
    expect(r.kind).toBe("skip");
    if (r.kind === "skip") expect(r.reason).toBe("not_footwear");
  });

  it("skips when productType is null", () => {
    const r = processProduct(input({ productType: null }));
    expect(r.kind).toBe("skip");
  });

  it("accepts case-insensitive matches (e.g. 'shoes')", () => {
    const r = processProduct(input({ productType: "shoes" }));
    // Will go past the footwear gate and fail elsewhere (no variants → success)
    expect(r.kind).not.toBe("skip");
  });

  it("accepts Italian-language productType (Calzature)", () => {
    const r = processProduct(input({ productType: "Calzature" }));
    expect(r.kind).not.toBe("skip");
  });
});

describe("processProduct — missing metafields", () => {
  it("emits MISSING_METAFIELD when gender is null", () => {
    const r = processProduct(input({ gender: null }));
    expect(r.kind).toBe("draft");
    if (r.kind === "draft") {
      expect(r.productAlert?.errorCode).toBe("MISSING_METAFIELD");
      expect(r.tagsToAdd).toContain(SIZE_NORM_ERROR_TAG);
    }
  });

  it("emits MISSING_METAFIELD when scaleSigla is null", () => {
    const r = processProduct(input({ scaleSigla: null }));
    expect(r.kind).toBe("draft");
    if (r.kind === "draft") {
      expect(r.productAlert?.errorCode).toBe("MISSING_METAFIELD");
    }
  });

  it("emits MISSING_METAFIELD when gender is empty whitespace", () => {
    const r = processProduct(input({ gender: "   " }));
    expect(r.kind).toBe("draft");
    if (r.kind === "draft") {
      expect(r.productAlert?.errorCode).toBe("MISSING_METAFIELD");
    }
  });

  it("rejects invalid gender values", () => {
    const r = processProduct(input({ gender: "robot" }));
    expect(r.kind).toBe("draft");
    if (r.kind === "draft") {
      expect(r.productAlert?.errorCode).toBe("MISSING_METAFIELD");
    }
  });
});

describe("processProduct — scale and gender validation", () => {
  it("emits TABLE_NOT_FOUND when scale is null", () => {
    const r = processProduct({
      product: product(),
      scale: null,
      tables: [],
    });
    expect(r.kind).toBe("draft");
    if (r.kind === "draft") {
      expect(r.productAlert?.errorCode).toBe("TABLE_NOT_FOUND");
    }
  });

  it("emits GENDER_MISMATCH when product gender doesn't match scale gender", () => {
    // Scale G is men; pass a women product.
    const r = processProduct(input({ gender: "women" }));
    expect(r.kind).toBe("draft");
    if (r.kind === "draft") {
      expect(r.productAlert?.errorCode).toBe("GENDER_MISMATCH");
    }
  });

  it("accepts unisex product on a unisex scale", () => {
    const r = processProduct(input({ gender: "unisex" }, scale("AM"), tablesFor("AM")));
    // Scale AM gender is unisex → passes gender check; no variants → success
    expect(r.kind).toBe("success");
  });

  it("unisex SCALE accepts any product gender (kid product)", () => {
    const r = processProduct(input({ gender: "kid" }, scale("AM"), tablesFor("AM")));
    expect(r.kind).not.toBe("draft");
  });
});

describe("processProduct — per-variant happy path on scale G", () => {
  it("resolves a single recognized variant to a complete matrix", () => {
    const r = processProduct(
      input({
        variants: [
          {
            id: "gid://shopify/ProductVariant/100",
            title: "EU 41",
            selectedOptions: [{ name: "Size", value: "41" }],
          },
        ],
      }),
    );
    expect(r.kind).toBe("success");
    if (r.kind === "success") {
      expect(r.variantWrites).toHaveLength(1);
      expect(r.variantWrites[0]?.sourceLabel).toBe("41");
      expect(r.variantWrites[0]?.matrix.us).toBe("9");
      expect(r.variantWrites[0]?.matrix.eu).toBe("41");
    }
  });

  it("normalizes input variants to canonical labels (38.5 → 38½)", () => {
    const r = processProduct(
      input({
        variants: [
          {
            id: "gid://shopify/ProductVariant/101",
            title: "EU 38.5",
            selectedOptions: [{ name: "Size", value: "38.5" }],
          },
        ],
      }),
    );
    expect(r.kind).toBe("success");
    if (r.kind === "success") {
      expect(r.variantWrites[0]?.sourceLabel).toBe("38½");
    }
  });

  it("accepts Italian-language option name 'Taglia'", () => {
    const r = processProduct(
      input({
        variants: [
          {
            id: "gid://shopify/ProductVariant/102",
            title: "Taglia 42",
            selectedOptions: [{ name: "Taglia", value: "42" }],
          },
        ],
      }),
    );
    expect(r.kind).toBe("success");
  });
});

describe("processProduct — variant-level alerts", () => {
  it("emits LABEL_NOT_RECOGNIZED for unknown variant value", () => {
    const r = processProduct(
      input({
        variants: [
          {
            id: "gid://shopify/ProductVariant/200",
            title: "EU 99",
            selectedOptions: [{ name: "Size", value: "99" }],
          },
        ],
      }),
    );
    expect(r.kind).toBe("draft");
    if (r.kind === "draft") {
      expect(r.variantAlerts).toHaveLength(1);
      expect(r.variantAlerts[0]?.errorCode).toBe("LABEL_NOT_RECOGNIZED");
    }
  });

  it("emits LABEL_NOT_RECOGNIZED when variant has no size option", () => {
    const r = processProduct(
      input({
        variants: [
          {
            id: "gid://shopify/ProductVariant/201",
            title: "Color: Red",
            selectedOptions: [{ name: "Color", value: "Red" }],
          },
        ],
      }),
    );
    expect(r.kind).toBe("draft");
    if (r.kind === "draft") {
      expect(r.variantAlerts[0]?.errorCode).toBe("LABEL_NOT_RECOGNIZED");
    }
  });

  it("preserves successful variants in draft outcome (partial success)", () => {
    const r = processProduct(
      input({
        variants: [
          {
            id: "gid://shopify/ProductVariant/300",
            title: "EU 41",
            selectedOptions: [{ name: "Size", value: "41" }],
          },
          {
            id: "gid://shopify/ProductVariant/301",
            title: "EU 99",
            selectedOptions: [{ name: "Size", value: "99" }],
          },
        ],
      }),
    );
    expect(r.kind).toBe("draft");
    if (r.kind === "draft") {
      expect(r.variantWrites).toHaveLength(1);
      expect(r.variantWrites[0]?.variantId).toBe(
        "gid://shopify/ProductVariant/300",
      );
      expect(r.variantAlerts).toHaveLength(1);
    }
  });
});

describe("processProduct — error tag delta", () => {
  it("adds the error tag when transitioning to draft", () => {
    const r = processProduct(input({ scaleSigla: null, tags: [] }));
    expect(r.kind).toBe("draft");
    if (r.kind === "draft") {
      expect(r.tagsToAdd).toContain(SIZE_NORM_ERROR_TAG);
      expect(r.tagsToRemove).toEqual([]);
    }
  });

  it("does not re-add the tag if it's already present", () => {
    const r = processProduct(
      input({ scaleSigla: null, tags: [SIZE_NORM_ERROR_TAG] }),
    );
    if (r.kind === "draft") {
      expect(r.tagsToAdd).toEqual([]);
    }
  });

  it("removes the error tag when transitioning back to success", () => {
    const r = processProduct(
      input({
        tags: [SIZE_NORM_ERROR_TAG],
        variants: [
          {
            id: "gid://shopify/ProductVariant/400",
            title: "EU 41",
            selectedOptions: [{ name: "Size", value: "41" }],
          },
        ],
      }),
    );
    expect(r.kind).toBe("success");
    if (r.kind === "success") {
      expect(r.tagsToRemove).toContain(SIZE_NORM_ERROR_TAG);
    }
  });

  it("leaves tags alone on success when error tag wasn't there", () => {
    const r = processProduct(
      input({
        tags: ["other-tag"],
        variants: [
          {
            id: "gid://shopify/ProductVariant/401",
            title: "EU 41",
            selectedOptions: [{ name: "Size", value: "41" }],
          },
        ],
      }),
    );
    if (r.kind === "success") {
      expect(r.tagsToAdd).toEqual([]);
      expect(r.tagsToRemove).toEqual([]);
    }
  });
});

describe("processProduct — vendor-aware brand lookup", () => {
  // Build a minimal brand-specific table that gives Gucci different numbers.
  const gucciG: ConversionTable = {
    scaleSigla: "G",
    brand: "Gucci",
    isSeed: false,
    mappings: [
      {
        sourceLabel: "41",
        us: "OVERRIDE_US",
        eu: "41",
        uk: "OVERRIDE_UK",
        jpMm: 999,
      },
    ],
  };

  it("uses brand-specific table when vendor matches", () => {
    const r = processProduct({
      product: product({
        vendor: "Gucci",
        variants: [
          {
            id: "gid://shopify/ProductVariant/500",
            title: "EU 41",
            selectedOptions: [{ name: "Size", value: "41" }],
          },
        ],
      }),
      scale: scale("G"),
      tables: [...tablesFor("G"), gucciG],
    });
    expect(r.kind).toBe("success");
    if (r.kind === "success") {
      expect(r.variantWrites[0]?.matrix.us).toBe("OVERRIDE_US");
    }
  });

  it("falls back to generic when vendor doesn't have a brand-specific table", () => {
    const r = processProduct({
      product: product({
        vendor: "UnknownBrand",
        variants: [
          {
            id: "gid://shopify/ProductVariant/501",
            title: "EU 41",
            selectedOptions: [{ name: "Size", value: "41" }],
          },
        ],
      }),
      scale: scale("G"),
      tables: [...tablesFor("G"), gucciG],
    });
    expect(r.kind).toBe("success");
    if (r.kind === "success") {
      expect(r.variantWrites[0]?.matrix.us).toBe("9");
    }
  });
});

describe("processProduct — multi-variant happy path on different scale types", () => {
  it("handles Hoka SH DOUBLE variant correctly (compound source_label, men's matrix)", () => {
    const r = processProduct(
      input(
        {
          scaleSigla: "SH",
          gender: "unisex",
          variants: [
            {
              id: "gid://shopify/ProductVariant/600",
              title: "Hoka 8/9.5",
              selectedOptions: [{ name: "Size", value: "8/9.5" }],
            },
          ],
        },
        scale("SH"),
        tablesFor("SH"),
      ),
    );
    expect(r.kind).toBe("success");
    if (r.kind === "success") {
      expect(r.variantWrites[0]?.sourceLabel).toBe("8/9.5");
      // SH's seed preserves the compound in `us`; EU/UK derived from men US 8.
      expect(r.variantWrites[0]?.matrix.us).toBe("8/9.5");
      expect(r.variantWrites[0]?.matrix.eu).toBe("40");
    }
  });

  it("handles JP scale (SJ) variant with cm-to-mm conversion", () => {
    const r = processProduct(
      input(
        {
          scaleSigla: "SJ",
          gender: "men",
          variants: [
            {
              id: "gid://shopify/ProductVariant/700",
              title: "JP 25.5",
              selectedOptions: [{ name: "Size", value: "25.5" }],
            },
          ],
        },
        scale("SJ"),
        tablesFor("SJ"),
      ),
    );
    expect(r.kind).toBe("success");
    if (r.kind === "success") {
      // The conversion-tables-seed converts cm→mm and looks up by jpMm column.
      expect(r.variantWrites[0]?.matrix.jpMm).toBeDefined();
    }
  });
});
