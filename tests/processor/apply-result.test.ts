import { describe, expect, it } from "vitest";

import {
  applyTagDelta,
  computeProductHash,
  resolveBrandDisplayScale,
  resolveProductStatusPatch,
  SIZE_NORM_ERROR_TAG,
} from "../../app/lib/processor/apply-result";
import type { ShopifyProduct } from "../../app/lib/shopify/client";

describe("applyTagDelta", () => {
  it("adds new tags at the end while preserving order", () => {
    expect(applyTagDelta(["a", "b"], ["c"], [])).toEqual(["a", "b", "c"]);
  });

  it("removes tags", () => {
    expect(applyTagDelta(["a", "b", "c"], [], ["b"])).toEqual(["a", "c"]);
  });

  it("does not duplicate tags already present", () => {
    expect(applyTagDelta(["a", "b"], ["b", "c"], [])).toEqual(["a", "b", "c"]);
  });

  it("removes the error tag specifically", () => {
    const before = ["x", SIZE_NORM_ERROR_TAG, "y"];
    expect(applyTagDelta(before, [], [SIZE_NORM_ERROR_TAG])).toEqual(["x", "y"]);
  });

  it("returns the same list when there are no changes", () => {
    expect(applyTagDelta(["a"], [], [])).toEqual(["a"]);
  });
});

describe("computeProductHash", () => {
  function baseProduct(): ShopifyProduct {
    return {
      id: "gid://shopify/Product/1",
      title: "Test",
      vendor: "Gucci",
      productType: "Shoes",
      status: "ACTIVE",
      tags: ["a"],
      gender: "men",
      scaleSigla: "G",
      ageCategory: null,
      variants: [
        {
          id: "gid://shopify/ProductVariant/10",
          title: "EU 41",
          selectedOptions: [{ name: "Size", value: "41" }],
        },
      ],
    };
  }

  it("returns the same hash for identical inputs", () => {
    expect(computeProductHash(baseProduct())).toBe(
      computeProductHash(baseProduct()),
    );
  });

  it("changes when vendor changes", () => {
    const p1 = baseProduct();
    const p2 = baseProduct();
    p2.vendor = "Adidas";
    expect(computeProductHash(p1)).not.toBe(computeProductHash(p2));
  });

  it("changes when gender metafield changes", () => {
    const p1 = baseProduct();
    const p2 = baseProduct();
    p2.gender = "women";
    expect(computeProductHash(p1)).not.toBe(computeProductHash(p2));
  });

  it("changes when a variant size option value changes", () => {
    const p1 = baseProduct();
    const p2 = baseProduct();
    p2.variants[0]!.selectedOptions[0]!.value = "42";
    expect(computeProductHash(p1)).not.toBe(computeProductHash(p2));
  });

  it("changes when title changes (feeds gender/footwear inference)", () => {
    const p1 = baseProduct();
    const p2 = baseProduct();
    p2.title = "Different title";
    expect(computeProductHash(p1)).not.toBe(computeProductHash(p2));
  });

  it("changes when tags change (feed gender/footwear inference)", () => {
    const p1 = baseProduct();
    const p2 = baseProduct();
    p2.tags = ["new-tag"];
    expect(computeProductHash(p1)).not.toBe(computeProductHash(p2));
  });

  it("is order-independent for tags", () => {
    const p1 = baseProduct();
    const p2 = baseProduct();
    p1.tags = ["a", "b"];
    p2.tags = ["b", "a"];
    expect(computeProductHash(p1)).toBe(computeProductHash(p2));
  });

  it("is order-independent for variants (sorted by id)", () => {
    const p1 = baseProduct();
    const p2 = baseProduct();
    p2.variants = [
      {
        id: "gid://shopify/ProductVariant/20",
        title: "EU 42",
        selectedOptions: [{ name: "Size", value: "42" }],
      },
      ...p2.variants,
    ];
    const p3 = baseProduct();
    p3.variants = [
      ...p3.variants,
      {
        id: "gid://shopify/ProductVariant/20",
        title: "EU 42",
        selectedOptions: [{ name: "Size", value: "42" }],
      },
    ];
    expect(computeProductHash(p2)).toBe(computeProductHash(p3));
    expect(computeProductHash(p1)).not.toBe(computeProductHash(p2));
  });
});

describe("resolveProductStatusPatch", () => {
  const tags = ["a", "b"];

  it("omits status entirely in safe mode (success)", () => {
    const patch = resolveProductStatusPatch("success", tags, [], [], false);
    expect(patch.status).toBeUndefined();
    expect("status" in patch).toBe(false);
  });

  it("omits status entirely in safe mode (draft)", () => {
    const patch = resolveProductStatusPatch("draft", tags, [], [], false);
    expect(patch.status).toBeUndefined();
  });

  it("sets ACTIVE on success when the merchant opted in", () => {
    expect(
      resolveProductStatusPatch("success", tags, [], [], true).status,
    ).toBe("ACTIVE");
  });

  it("sets DRAFT on failure when the merchant opted in", () => {
    expect(resolveProductStatusPatch("draft", tags, [], [], true).status).toBe(
      "DRAFT",
    );
  });

  it("applies the tag delta regardless of safe mode", () => {
    const safe = resolveProductStatusPatch(
      "draft",
      ["keep"],
      [SIZE_NORM_ERROR_TAG],
      [],
      false,
    );
    const managed = resolveProductStatusPatch(
      "draft",
      ["keep"],
      [SIZE_NORM_ERROR_TAG],
      [],
      true,
    );
    expect(safe.tags).toEqual(["keep", SIZE_NORM_ERROR_TAG]);
    expect(managed.tags).toEqual(["keep", SIZE_NORM_ERROR_TAG]);
  });

  it("removes the error tag on success in safe mode too", () => {
    const patch = resolveProductStatusPatch(
      "success",
      ["keep", SIZE_NORM_ERROR_TAG],
      [],
      [SIZE_NORM_ERROR_TAG],
      false,
    );
    expect(patch.tags).toEqual(["keep"]);
  });
});

describe("resolveBrandDisplayScale", () => {
  it("returns the configured scale for a slugified vendor", () => {
    expect(resolveBrandDisplayScale({ asics: "EU" }, "ASICS")).toBe("EU");
  });

  it("slugifies multi-word vendors", () => {
    expect(
      resolveBrandDisplayScale({ "new-balance": "US" }, "New Balance"),
    ).toBe("US");
  });

  it("returns empty string when the brand has no rule", () => {
    expect(resolveBrandDisplayScale({ asics: "EU" }, "Vans")).toBe("");
  });

  it("returns empty string when no rules are set at all", () => {
    expect(resolveBrandDisplayScale(null, "ASICS")).toBe("");
  });

  it("returns empty string for a missing vendor", () => {
    expect(resolveBrandDisplayScale({ asics: "EU" }, null)).toBe("");
    expect(resolveBrandDisplayScale({ asics: "EU" }, "   ")).toBe("");
  });

  it("ignores non-string values", () => {
    expect(resolveBrandDisplayScale({ asics: 42 }, "ASICS")).toBe("");
  });
});
