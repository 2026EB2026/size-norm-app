import { describe, expect, it } from "vitest";

import { parseLabel } from "../../app/lib/conversion/parse-label";
import { ATELIER_SCALES_BY_SIGLA } from "../../app/lib/conversion/scales-seed";
import type { SizeScale } from "../../app/lib/conversion/types";

/** Helper that asserts a scale exists in the seed and returns it. */
function scale(sigla: string): SizeScale {
  const s = ATELIER_SCALES_BY_SIGLA.get(sigla);
  if (s === undefined) throw new Error(`scale ${sigla} not in seed`);
  return s;
}

describe("parseLabel — basic invalid inputs", () => {
  const G = scale("G");

  it("returns null for null", () => {
    expect(parseLabel(null, G)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseLabel(undefined, G)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseLabel("", G)).toBeNull();
  });

  it("returns null for whitespace-only", () => {
    expect(parseLabel("   ", G)).toBeNull();
  });

  it("returns null for unknown label", () => {
    expect(parseLabel("99", G)).toBeNull();
  });
});

describe("parseLabel — unicode half-size glyph (scale G uses ½ canonically)", () => {
  const G = scale("G");

  it("matches the canonical form exactly", () => {
    expect(parseLabel("38½", G)?.canonical).toBe("38½");
  });

  it("normalizes decimal `.5` to canonical unicode", () => {
    expect(parseLabel("38.5", G)?.canonical).toBe("38½");
  });

  it("normalizes comma-decimal `,5` to canonical unicode", () => {
    expect(parseLabel("38,5", G)?.canonical).toBe("38½");
  });

  it("normalizes ASCII fraction `1/2` to canonical unicode", () => {
    expect(parseLabel("38 1/2", G)?.canonical).toBe("38½");
  });

  it("handles ASCII fraction with no space", () => {
    expect(parseLabel("381/2", G)?.canonical).toBe("38½");
  });

  it("preserves whole numbers", () => {
    expect(parseLabel("39", G)?.canonical).toBe("39");
  });

  it("trims surrounding whitespace", () => {
    expect(parseLabel("  39  ", G)?.canonical).toBe("39");
  });

  it("rejects the missing 37 (per merchant data, scale G has no 37)", () => {
    // Scale G jumps from 36 to 38 in the merchant's data
    expect(parseLabel("37", G)).toBeNull();
  });

  it("preserves the raw input on the result", () => {
    expect(parseLabel("38.5", G)?.raw).toBe("38.5");
  });
});

describe("parseLabel — comma canonical form (scale #BL uses `,` canonically)", () => {
  const BL = scale("#BL");

  it("matches the canonical comma form", () => {
    expect(parseLabel("38,5", BL)?.canonical).toBe("38,5");
  });

  it("normalizes decimal `.5` to comma form", () => {
    expect(parseLabel("38.5", BL)?.canonical).toBe("38,5");
  });

  it("normalizes unicode `½` to comma form", () => {
    expect(parseLabel("38½", BL)?.canonical).toBe("38,5");
  });

  it("normalizes ASCII `1/2` to comma form", () => {
    expect(parseLabel("38 1/2", BL)?.canonical).toBe("38,5");
  });
});

describe("parseLabel — JP mondopoint (scale SJ uses `.5` canonically)", () => {
  const SJ = scale("SJ");

  it("matches canonical dot form", () => {
    expect(parseLabel("25.5", SJ)?.canonical).toBe("25.5");
  });

  it("normalizes comma to dot", () => {
    expect(parseLabel("25,5", SJ)?.canonical).toBe("25.5");
  });

  it("normalizes unicode glyph to dot", () => {
    expect(parseLabel("25½", SJ)?.canonical).toBe("25.5");
  });

  it("accepts whole mondopoint values", () => {
    expect(parseLabel("28", SJ)?.canonical).toBe("28");
  });
});

describe("parseLabel — kid notation K-prefix (scale #BM and #BN)", () => {
  const BM = scale("#BM");
  const BN = scale("#BN");

  it("matches `K10` directly in #BM", () => {
    expect(parseLabel("K10", BM)?.canonical).toBe("K10");
  });

  it("matches `K4.5` directly in #BM", () => {
    expect(parseLabel("K4.5", BM)?.canonical).toBe("K4.5");
  });

  it("matches case-insensitively via alias (scale #BN)", () => {
    expect(parseLabel("k10", BN)?.canonical).toBe("K10");
  });

  it("matches youth size `3.5` (post-K range) in #BM", () => {
    expect(parseLabel("3.5", BM)?.canonical).toBe("3.5");
  });

  it("rejects `Z99` (not in label set)", () => {
    expect(parseLabel("Z99", BM)).toBeNull();
  });
});

describe("parseLabel — Hoka double sizing (scale SH source=DOUBLE)", () => {
  const SH = scale("SH");

  it("matches compound label `3.5/5`", () => {
    expect(parseLabel("3.5/5", SH)?.canonical).toBe("3.5/5");
  });

  it("preserves the `/` separator and decimal forms", () => {
    expect(parseLabel("8.5/10", SH)?.canonical).toBe("8.5/10");
  });

  it("rejects half of a compound (`3.5` alone)", () => {
    expect(parseLabel("3.5", SH)).toBeNull();
  });
});

describe("parseLabel — M/W combined (scale BQ and BP source=MW_COMBINED)", () => {
  const BQ = scale("BQ");
  const BP = scale("BP");

  it("matches `M8/W9.5` in BQ", () => {
    expect(parseLabel("M8/W9.5", BQ)?.canonical).toBe("M8/W9.5");
  });

  it("matches `M8½/W10½` (unicode form) in BP", () => {
    expect(parseLabel("M8½/W10½", BP)?.canonical).toBe("M8½/W10½");
  });

  it("rejects unknown M/W combinations", () => {
    expect(parseLabel("M99/W100", BQ)).toBeNull();
  });
});

describe("parseLabel — adidas Unisex UK (scale SUA)", () => {
  const SUA = scale("SUA");

  it("matches integer label", () => {
    expect(parseLabel("9", SUA)?.canonical).toBe("9");
  });

  it("matches half via decimal", () => {
    expect(parseLabel("9.5", SUA)?.canonical).toBe("9½");
  });

  it("matches half via unicode", () => {
    expect(parseLabel("9½", SUA)?.canonical).toBe("9½");
  });
});

describe("parseLabel — aliases", () => {
  const customScale: SizeScale = {
    sigla: "CUSTOM",
    name: "Custom test scale",
    gender: "unisex",
    sourceScale: "EU",
    labels: ["40", "41"],
    aliases: {
      "forty": "40",
      "forty-one": "41",
    },
  };

  it("matches a lowercase alias", () => {
    expect(parseLabel("forty", customScale)?.canonical).toBe("40");
  });

  it("matches an alias with different input casing", () => {
    expect(parseLabel("FORTY", customScale)?.canonical).toBe("40");
  });

  it("falls through to label match if alias misses", () => {
    expect(parseLabel("41", customScale)?.canonical).toBe("41");
  });
});

describe("parseLabel — pathological inputs", () => {
  const G = scale("G");

  it("returns null for letters in a numeric scale", () => {
    expect(parseLabel("abc", G)).toBeNull();
  });

  it("returns null for negative numbers", () => {
    expect(parseLabel("-1", G)).toBeNull();
  });

  it("does not crash on very long input", () => {
    expect(parseLabel("1".repeat(1000), G)).toBeNull();
  });

  it("does not match a fraction-like glyph that isn't in the scale's label set", () => {
    expect(parseLabel("99½", G)).toBeNull();
  });
});
