import { describe, expect, it } from "vitest";

import {
  applyTagDelta,
  computeProductHash,
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
