import { describe, expect, it } from "vitest";

import {
  inferAgeCategoryFromText,
  inferGenderFromText,
  looksLikeFootwear,
} from "../../app/lib/processor/infer-attributes";

function product(overrides: {
  title?: string | null;
  productType?: string | null;
  tags?: string[];
}) {
  return {
    title: overrides.title ?? null,
    productType: overrides.productType ?? null,
    tags: overrides.tags ?? [],
  };
}

describe("inferGenderFromText", () => {
  it("detects women from Italian title", () => {
    expect(
      inferGenderFromText(product({ title: "Sneakers ASICS donna" })),
    ).toBe("women");
  });

  it("detects men from English tag", () => {
    expect(
      inferGenderFromText(product({ title: "Runner X", tags: ["men"] })),
    ).toBe("men");
  });

  it("does NOT match 'men' inside 'women' (token-based)", () => {
    expect(
      inferGenderFromText(product({ title: "Women running shoes" })),
    ).toBe("women");
  });

  it("returns unisex when both genders appear", () => {
    expect(
      inferGenderFromText(product({ title: "Scarpe uomo donna" })),
    ).toBe("unisex");
  });

  it("kid keywords win over adult genders", () => {
    expect(
      inferGenderFromText(product({ title: "Scarpe bambino", tags: ["uomo"] })),
    ).toBe("kid");
  });

  it("detects unisex keyword", () => {
    expect(inferGenderFromText(product({ tags: ["Unisex"] }))).toBe("unisex");
  });

  it("returns null with no signal", () => {
    expect(inferGenderFromText(product({ title: "Scarpa prova 5" }))).toBe(
      null,
    );
  });

  it("reads productType too", () => {
    expect(
      inferGenderFromText(product({ productType: "Scarpe Donna" })),
    ).toBe("women");
  });
});

describe("inferAgeCategoryFromText", () => {
  it("detects toddler", () => {
    expect(
      inferAgeCategoryFromText(product({ title: "Vans toddler sneaker" })),
    ).toBe("toddler");
  });

  it("detects junior from tag", () => {
    expect(
      inferAgeCategoryFromText(product({ tags: ["Junior"] })),
    ).toBe("junior");
  });

  it("maps newborn/neonato to crib", () => {
    expect(
      inferAgeCategoryFromText(product({ title: "Scarpine neonato" })),
    ).toBe("crib");
  });

  it("returns null with no age signal", () => {
    expect(
      inferAgeCategoryFromText(product({ title: "Scarpe bambino" })),
    ).toBe(null);
  });
});

describe("looksLikeFootwear", () => {
  it("matches Italian 'scarpa' in the title", () => {
    expect(looksLikeFootwear(product({ title: "Scarpa prova 5" }))).toBe(true);
  });

  it("matches sneakers tag", () => {
    expect(looksLikeFootwear(product({ tags: ["Sneakers"] }))).toBe(true);
  });

  it("rejects non-footwear products", () => {
    expect(looksLikeFootwear(product({ title: "T-shirt logo" }))).toBe(false);
  });

  it("matches productType keyword", () => {
    expect(looksLikeFootwear(product({ productType: "Boots" }))).toBe(true);
  });
});
