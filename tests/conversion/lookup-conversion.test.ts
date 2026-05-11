import { describe, expect, it } from "vitest";

import { lookupConversion } from "../../app/lib/conversion/lookup-conversion";
import type { ConversionTable } from "../../app/lib/conversion/types";

const genericG: ConversionTable = {
  scaleSigla: "G",
  brand: null,
  isSeed: true,
  mappings: [
    { sourceLabel: "41", us: "8", eu: "41", uk: "7", jpMm: 255 },
    { sourceLabel: "41½", us: "8.5", eu: "41.5", uk: "7.5", jpMm: 258 },
  ],
};

const gucciG: ConversionTable = {
  scaleSigla: "G",
  brand: "Gucci",
  isSeed: false,
  mappings: [
    { sourceLabel: "41", us: "7.5", eu: "41", uk: "6.5", jpMm: 253 },
    { sourceLabel: "41½", us: "8", eu: "41.5", uk: "7", jpMm: 256 },
  ],
};

const otherScaleI: ConversionTable = {
  scaleSigla: "I",
  brand: null,
  isSeed: true,
  mappings: [{ sourceLabel: "38", us: "7.5", eu: "38", uk: "5.5", jpMm: 235 }],
};

describe("lookupConversion — priority brand-specific over generic", () => {
  it("uses brand-specific table when brand matches exactly", () => {
    const result = lookupConversion("G", "Gucci", "41", [genericG, gucciG]);
    expect(result?.matrix.us).toBe("7.5");
    expect(result?.fromBrandSpecific).toBe(true);
    expect(result?.brandUsed).toBe("Gucci");
  });

  it("matches brand case-insensitively (`GUCCI` → `Gucci` table)", () => {
    const result = lookupConversion("G", "GUCCI", "41", [genericG, gucciG]);
    expect(result?.matrix.us).toBe("7.5");
  });

  it("matches brand with surrounding whitespace", () => {
    const result = lookupConversion("G", "  gucci  ", "41", [genericG, gucciG]);
    expect(result?.matrix.us).toBe("7.5");
  });

  it("falls back to generic when brand has no specific table", () => {
    const result = lookupConversion(
      "G",
      "UnknownBrand",
      "41",
      [genericG, gucciG],
    );
    expect(result?.matrix.us).toBe("8");
    expect(result?.fromBrandSpecific).toBe(false);
    expect(result?.brandUsed).toBeNull();
  });
});

describe("lookupConversion — generic-only flows", () => {
  it("uses generic when brand is null", () => {
    const result = lookupConversion("G", null, "41", [genericG]);
    expect(result?.matrix.us).toBe("8");
    expect(result?.fromBrandSpecific).toBe(false);
  });

  it("uses generic when brand is empty string", () => {
    const result = lookupConversion("G", "", "41", [genericG]);
    expect(result?.fromBrandSpecific).toBe(false);
  });

  it("uses generic when brand is whitespace-only", () => {
    const result = lookupConversion("G", "   ", "41", [genericG]);
    expect(result?.fromBrandSpecific).toBe(false);
  });
});

describe("lookupConversion — null results", () => {
  it("returns null when scale has no table", () => {
    expect(lookupConversion("UNKNOWN", null, "41", [genericG])).toBeNull();
  });

  it("returns null when label has no mapping in either table", () => {
    expect(
      lookupConversion("G", "Gucci", "99", [genericG, gucciG]),
    ).toBeNull();
  });

  it("returns null when brand table exists but label is missing AND generic table is also missing the label", () => {
    const partialBrand: ConversionTable = {
      scaleSigla: "G",
      brand: "PartialBrand",
      isSeed: false,
      mappings: [{ sourceLabel: "41", us: "8", eu: "41", uk: "7", jpMm: 255 }],
    };
    // 41½ is not in PartialBrand, but IS in genericG — fallback works.
    const result = lookupConversion(
      "G",
      "PartialBrand",
      "41½",
      [partialBrand, genericG],
    );
    expect(result?.matrix.us).toBe("8.5");
    expect(result?.fromBrandSpecific).toBe(false);
  });

  it("returns null when neither brand-specific nor generic has the label", () => {
    const result = lookupConversion("G", "Gucci", "99", [genericG, gucciG]);
    expect(result).toBeNull();
  });

  it("does not match a table from a different scale", () => {
    const result = lookupConversion("G", null, "38", [otherScaleI]);
    expect(result).toBeNull();
  });
});

describe("lookupConversion — empty tables array", () => {
  it("returns null", () => {
    expect(lookupConversion("G", "Gucci", "41", [])).toBeNull();
  });
});
