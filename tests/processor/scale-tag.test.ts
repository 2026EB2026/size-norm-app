import { describe, expect, it } from "vitest";

import {
  normalizeScaleTagValue,
  parseScaleTag,
  SCALE_TAG_PREFIX,
} from "../../app/lib/processor/scale-tag";
import { ATELIER_SCALES_V1 } from "../../app/lib/conversion";

describe("normalizeScaleTagValue", () => {
  it("trims, collapses inner whitespace and lowercases", () => {
    expect(normalizeScaleTagValue("  Scarpe   Donna  USA ")).toBe(
      "scarpe donna usa",
    );
  });

  it("is idempotent", () => {
    const once = normalizeScaleTagValue("SCARPE UNISEX ADIDAS (UK)");
    expect(normalizeScaleTagValue(once)).toBe(once);
  });

  it("keeps punctuation that is part of the name", () => {
    expect(normalizeScaleTagValue("Bambino Scarpe IT 14-22,5")).toBe(
      "bambino scarpe it 14-22,5",
    );
  });
});

describe("parseScaleTag", () => {
  it("returns none when no SCALATAGLIE_ tag is present", () => {
    expect(parseScaleTag(["Woman", "Footwear", "BRAND_Crocs"])).toEqual({
      kind: "none",
    });
  });

  it("extracts the value after the prefix", () => {
    const r = parseScaleTag([
      "Woman",
      "SCALATAGLIE_Scarpe Donna USA",
      "Scarpe Donna USA",
    ]);
    expect(r).toEqual({
      kind: "value",
      raw: "Scarpe Donna USA",
      normalized: "scarpe donna usa",
    });
  });

  it("ignores the bare duplicate tag the ERP also emits", () => {
    // "Scarpe Donna USA" appears twice on real products: once prefixed,
    // once bare. Only the prefixed one is a scale declaration.
    const r = parseScaleTag(["Scarpe Donna IT", "SCALATAGLIE_Scarpe Donna IT"]);
    expect(r.kind).toBe("value");
    if (r.kind === "value") expect(r.raw).toBe("Scarpe Donna IT");
  });

  it("matches the prefix case-insensitively", () => {
    const r = parseScaleTag(["scalataglie_Scarpe Uomo IT"]);
    expect(r.kind).toBe("value");
    if (r.kind === "value") expect(r.normalized).toBe("scarpe uomo it");
  });

  it("collapses duplicates that differ only by case or spacing", () => {
    const r = parseScaleTag([
      "SCALATAGLIE_Scarpe Uomo USA",
      "SCALATAGLIE_scarpe  uomo usa",
    ]);
    expect(r.kind).toBe("value");
  });

  it("reports ambiguity when two different scales are declared", () => {
    const r = parseScaleTag([
      "SCALATAGLIE_Scarpe Uomo USA",
      "SCALATAGLIE_Scarpe Uomo IT",
    ]);
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") expect(r.raws).toHaveLength(2);
  });

  it("flags the ERP's retired-scale `x` prefix as out of scope", () => {
    const r = parseScaleTag(["SCALATAGLIE_xAmericane SML"]);
    expect(r).toEqual({ kind: "out_of_scope", raw: "xAmericane SML" });
  });

  it("does not treat a real scale name as retired", () => {
    for (const s of ATELIER_SCALES_V1) {
      const r = parseScaleTag([`${SCALE_TAG_PREFIX}${s.name}`]);
      expect(r.kind).toBe("value");
    }
  });

  it("ignores an empty value", () => {
    expect(parseScaleTag(["SCALATAGLIE_", "SCALATAGLIE_   "])).toEqual({
      kind: "none",
    });
  });
});

describe("tag values observed on the live catalogue", () => {
  // Sampled from eleonorabonucci.myshopify.com productTags on 2026-09-10.
  const FOOTWEAR_TAGS: Record<string, string> = {
    "Scarpe Donna IT": "I",
    "Scarpe Donna USA": "R",
    "Scarpe Uomo IT": "G",
    "Scarpe Uomo USA": "P",
    "SCARPE UNISEX ADIDAS (UK)": "SUA",
    "Bambino Scarpe IT 23-41": "#BL",
  };

  const byTagValue = new Map(
    ATELIER_SCALES_V1.map((s) => [normalizeScaleTagValue(s.name), s]),
  );

  it("every footwear tag resolves to the expected seeded scale", () => {
    for (const [tag, sigla] of Object.entries(FOOTWEAR_TAGS)) {
      const parsed = parseScaleTag([`${SCALE_TAG_PREFIX}${tag}`]);
      expect(parsed.kind).toBe("value");
      if (parsed.kind !== "value") continue;
      expect(byTagValue.get(parsed.normalized)?.sigla).toBe(sigla);
    }
  });

  it("resolves the base each scale is expressed in", () => {
    const base = (tag: string): string | undefined =>
      byTagValue.get(normalizeScaleTagValue(tag))?.sourceScale;
    // The whole point of the tag: same product family, different base.
    expect(base("Scarpe Donna USA")).toBe("US");
    expect(base("Scarpe Donna IT")).toBe("EU");
    expect(base("SCARPE UNISEX ADIDAS (UK)")).toBe("UK");
  });

  it("non-footwear tags map to no scale (the footwear gate handles them)", () => {
    const NON_FOOTWEAR = [
      "Abb Donna DE",
      "Abb Donna IT",
      "Abb Uomo IT",
      "AMERICANE MIX",
      "Americane SML",
      "Bambino Anni 0-16",
      "Bambino Unica",
      "Unica",
    ];
    for (const tag of NON_FOOTWEAR) {
      expect(byTagValue.has(normalizeScaleTagValue(tag))).toBe(false);
    }
  });

  it("seeded tag values are unique per shop (the DB unique index holds)", () => {
    expect(byTagValue.size).toBe(ATELIER_SCALES_V1.length);
  });
});
