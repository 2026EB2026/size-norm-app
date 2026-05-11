import { describe, expect, it } from "vitest";

import {
  ATELIER_SCALES_BY_SIGLA,
  ATELIER_SCALES_V1,
} from "../../app/lib/conversion/scales-seed";
import { GENERIC_CONVERSION_TABLES_V1 } from "../../app/lib/conversion/conversion-tables-seed";
import { MEN_MASTER, WOMEN_MASTER } from "../../app/lib/conversion/master-tables";

describe("seed integrity — 28 V1 scales", () => {
  it("has exactly 28 scales", () => {
    expect(ATELIER_SCALES_V1).toHaveLength(28);
  });

  it("excludes #BZ (Roman numerals, out of V1 scope)", () => {
    expect(ATELIER_SCALES_BY_SIGLA.has("#BZ")).toBe(false);
  });

  it("excludes #CG (SML categorical)", () => {
    expect(ATELIER_SCALES_BY_SIGLA.has("#CG")).toBe(false);
  });

  it("excludes #BB (Bambino US baby, only 2 labels)", () => {
    expect(ATELIER_SCALES_BY_SIGLA.has("#BB")).toBe(false);
  });

  it("excludes X (Scarpe Doppia range)", () => {
    expect(ATELIER_SCALES_BY_SIGLA.has("X")).toBe(false);
  });

  it("excludes Y (Snow Boot triple range)", () => {
    expect(ATELIER_SCALES_BY_SIGLA.has("Y")).toBe(false);
  });

  it("excludes BA and BB Snow Boot ranges", () => {
    expect(ATELIER_SCALES_BY_SIGLA.has("BA")).toBe(false);
    expect(ATELIER_SCALES_BY_SIGLA.has("BB")).toBe(false);
  });

  const inScope = [
    "#BK",
    "#BL",
    "#CE",
    "#BN",
    "#BM",
    "DC",
    "I",
    "AD",
    "R",
    "DD",
    "DB",
    "G",
    "SJ",
    "AQ",
    "M",
    "P",
    "DE",
    "BH",
    "AM",
    "AF",
    "AG",
    "SUA",
    "SH",
    "CO",
    "CP",
    "#DF",
    "BQ",
    "BP",
  ];

  it.each(inScope)("includes scale %s", (sigla) => {
    expect(ATELIER_SCALES_BY_SIGLA.has(sigla)).toBe(true);
  });

  it("all scales have a non-empty name", () => {
    for (const s of ATELIER_SCALES_V1) {
      expect(s.name.length).toBeGreaterThan(0);
    }
  });

  it("all scales have at least one label", () => {
    for (const s of ATELIER_SCALES_V1) {
      expect(s.labels.length).toBeGreaterThan(0);
    }
  });

  it("labels in a scale are unique", () => {
    for (const s of ATELIER_SCALES_V1) {
      const unique = new Set(s.labels);
      expect(unique.size).toBe(s.labels.length);
    }
  });

  it("aliases keys are all lowercase (parse-label expects lowercase keys)", () => {
    for (const s of ATELIER_SCALES_V1) {
      for (const key of Object.keys(s.aliases)) {
        expect(key).toBe(key.toLowerCase());
      }
    }
  });

  it("aliases values all resolve to a canonical label", () => {
    for (const s of ATELIER_SCALES_V1) {
      for (const target of Object.values(s.aliases)) {
        expect(s.labels).toContain(target);
      }
    }
  });

  it("sigle are unique across scales", () => {
    const siglas = ATELIER_SCALES_V1.map((s) => s.sigla);
    const unique = new Set(siglas);
    expect(unique.size).toBe(siglas.length);
  });
});

describe("seed integrity — generic conversion tables", () => {
  it("has exactly one table per scale", () => {
    expect(GENERIC_CONVERSION_TABLES_V1).toHaveLength(
      ATELIER_SCALES_V1.length,
    );
  });

  it("every table has brand=null and isSeed=true", () => {
    for (const t of GENERIC_CONVERSION_TABLES_V1) {
      expect(t.brand).toBeNull();
      expect(t.isSeed).toBe(true);
    }
  });

  it("every table's scaleSigla matches a scale in the seed", () => {
    for (const t of GENERIC_CONVERSION_TABLES_V1) {
      expect(ATELIER_SCALES_BY_SIGLA.has(t.scaleSigla)).toBe(true);
    }
  });

  it("every scale label has a mapping in its generic table", () => {
    for (const t of GENERIC_CONVERSION_TABLES_V1) {
      const scale = ATELIER_SCALES_BY_SIGLA.get(t.scaleSigla);
      expect(scale).toBeDefined();
      const mappedLabels = new Set(t.mappings.map((m) => m.sourceLabel));
      for (const label of scale!.labels) {
        expect(mappedLabels.has(label)).toBe(true);
      }
    }
  });

  // Scales where the seed legitimately produces empty mappings (label set
  // doesn't intersect master tables):
  //   - `#CE` Bambino UK1: labels `30, 35, 40, 50` are merchant-specific
  //     groupings, not standard kid UK sizes. Merchant validates in M3.
  //   - `#DF` Bambino US Doppia: only 2 labels (`K10/K13.5`, `1/6`) and the
  //     men-side parser doesn't handle K-prefix or `1/6` as a recognized
  //     double-sizing pattern.
  const SCALES_WITH_LEGITIMATELY_EMPTY_MAPPINGS = new Set(["#CE", "#DF"]);

  it("the source column for numeric scales is non-null in at least one mapping (except known empty seeds)", () => {
    const numericScales = ATELIER_SCALES_V1.filter(
      (s) =>
        s.sourceScale === "EU" ||
        s.sourceScale === "US" ||
        s.sourceScale === "UK" ||
        s.sourceScale === "JP_MM",
    );
    for (const s of numericScales) {
      if (SCALES_WITH_LEGITIMATELY_EMPTY_MAPPINGS.has(s.sigla)) continue;
      const t = GENERIC_CONVERSION_TABLES_V1.find(
        (x) => x.scaleSigla === s.sigla,
      );
      expect(t).toBeDefined();
      const hasAnyMapped = t!.mappings.some(
        (m) =>
          m.us !== null ||
          m.eu !== null ||
          m.uk !== null ||
          m.jpMm !== null,
      );
      expect(hasAnyMapped, `scale ${s.sigla} has all-null mappings`).toBe(true);
    }
  });

  it("DOUBLE scales preserve the compound label in the us column", () => {
    const doubleScales = ATELIER_SCALES_V1.filter(
      (s) => s.sourceScale === "DOUBLE",
    );
    for (const s of doubleScales) {
      const t = GENERIC_CONVERSION_TABLES_V1.find(
        (x) => x.scaleSigla === s.sigla,
      )!;
      for (const m of t.mappings) {
        if (m.eu !== null) {
          expect(m.us).toBe(m.sourceLabel);
        }
      }
    }
  });

  it("MW_COMBINED scales preserve the M/W compound label in the us column", () => {
    const mwScales = ATELIER_SCALES_V1.filter(
      (s) => s.sourceScale === "MW_COMBINED",
    );
    for (const s of mwScales) {
      const t = GENERIC_CONVERSION_TABLES_V1.find(
        (x) => x.scaleSigla === s.sigla,
      )!;
      for (const m of t.mappings) {
        if (m.eu !== null) {
          expect(m.us).toBe(m.sourceLabel);
          expect(m.us).toMatch(/^M.+\/W.+$/);
        }
      }
    }
  });
});

describe("master tables — Brannock 1:1 mapping", () => {
  it("MEN_MASTER and WOMEN_MASTER are non-empty", () => {
    expect(MEN_MASTER.length).toBeGreaterThan(20);
    expect(WOMEN_MASTER.length).toBeGreaterThan(15);
  });

  it("MEN_MASTER has unique US values (no duplicates allow reverse lookup)", () => {
    const uss = MEN_MASTER.map((r) => r.us);
    expect(new Set(uss).size).toBe(uss.length);
  });

  it("MEN_MASTER has unique EU values", () => {
    const eus = MEN_MASTER.map((r) => r.eu);
    expect(new Set(eus).size).toBe(eus.length);
  });

  it("MEN_MASTER has unique UK values", () => {
    const uks = MEN_MASTER.map((r) => r.uk);
    expect(new Set(uks).size).toBe(uks.length);
  });

  it("WOMEN_MASTER has unique US values", () => {
    const uss = WOMEN_MASTER.map((r) => r.us);
    expect(new Set(uss).size).toBe(uss.length);
  });

  it("MEN_MASTER row: EU 41 maps to US 9 (Brannock 1:1)", () => {
    const row = MEN_MASTER.find((r) => r.eu === "41");
    expect(row?.us).toBe("9");
  });

  it("MEN_MASTER row: EU 38 maps to US 6 (Brannock 1:1)", () => {
    const row = MEN_MASTER.find((r) => r.eu === "38");
    expect(row?.us).toBe("6");
  });

  it("WOMEN_MASTER row: EU 38 maps to US 7.5", () => {
    const row = WOMEN_MASTER.find((r) => r.eu === "38");
    expect(row?.us).toBe("7.5");
  });

  it("Mondopoint values are integers", () => {
    for (const r of MEN_MASTER) expect(Number.isInteger(r.jpMm)).toBe(true);
    for (const r of WOMEN_MASTER) expect(Number.isInteger(r.jpMm)).toBe(true);
  });
});

describe("end-to-end: parse → lookup for representative scales", () => {
  it("Scarpe Uomo IT (#G): `41` → US 9, EU 41, UK 8, JP-mm 250", () => {
    const t = GENERIC_CONVERSION_TABLES_V1.find((x) => x.scaleSigla === "G")!;
    const mapping = t.mappings.find((m) => m.sourceLabel === "41")!;
    expect(mapping.us).toBe("9");
    expect(mapping.eu).toBe("41");
    expect(mapping.uk).toBe("8");
    expect(mapping.jpMm).toBe(250);
  });

  it("Scarpe Donna IT (I): `38` → US 7.5 EU 38", () => {
    const t = GENERIC_CONVERSION_TABLES_V1.find((x) => x.scaleSigla === "I")!;
    const mapping = t.mappings.find((m) => m.sourceLabel === "38")!;
    expect(mapping.us).toBe("7.5");
    expect(mapping.eu).toBe("38");
  });

  it("Scarpe Uomo USA (P): `10` → EU 42 UK 9", () => {
    const t = GENERIC_CONVERSION_TABLES_V1.find((x) => x.scaleSigla === "P")!;
    const mapping = t.mappings.find((m) => m.sourceLabel === "10")!;
    expect(mapping.eu).toBe("42");
    expect(mapping.uk).toBe("9");
  });

  it("Hoka SH (DOUBLE): `8/9.5` → us preserved as compound, eu derived from men US 8", () => {
    const t = GENERIC_CONVERSION_TABLES_V1.find((x) => x.scaleSigla === "SH")!;
    const mapping = t.mappings.find((m) => m.sourceLabel === "8/9.5")!;
    expect(mapping.us).toBe("8/9.5");
    expect(mapping.eu).toBe("40");
  });

  it("BQ (MW_COMBINED): `M8/W9.5` → us preserved as M/W token, eu derived from men US 8", () => {
    const t = GENERIC_CONVERSION_TABLES_V1.find((x) => x.scaleSigla === "BQ")!;
    const mapping = t.mappings.find((m) => m.sourceLabel === "M8/W9.5")!;
    expect(mapping.us).toBe("M8/W9.5");
    expect(mapping.eu).toBe("40");
  });

  it("Scarpe uomo JP (SJ): `27` mondopoint has a mapping entry", () => {
    const t = GENERIC_CONVERSION_TABLES_V1.find(
      (x) => x.scaleSigla === "SJ",
    );
    expect(t).toBeDefined();
    const mapping = t!.mappings.find((m) => m.sourceLabel === "27");
    expect(mapping).toBeDefined();
  });
});
