import { describe, expect, it } from "vitest";

import {
  ATELIER_SCALES_BY_SIGLA,
  BRAND_OFFICIAL_TABLES_V1,
  GENERIC_CONVERSION_TABLES_V1,
  lookupConversion,
  parseLabel,
} from "../../app/lib/conversion";

const adidas = BRAND_OFFICIAL_TABLES_V1.find(
  (t) => t.brand === "Adidas Originals",
);

describe("official brand charts — shape", () => {
  it("every table carries a brand and targets a seeded scale", () => {
    for (const t of BRAND_OFFICIAL_TABLES_V1) {
      expect(t.brand, "a table without a brand would shadow the generic one")
        .toBeTruthy();
      expect(ATELIER_SCALES_BY_SIGLA.has(t.scaleSigla)).toBe(true);
    }
  });

  it("every sourceLabel is a canonical label of its scale", () => {
    // lookupConversion is handed the canonical label parseLabel produced, so
    // a row keyed on anything else is dead weight.
    for (const t of BRAND_OFFICIAL_TABLES_V1) {
      const labels = new Set(
        ATELIER_SCALES_BY_SIGLA.get(t.scaleSigla)?.labels ?? [],
      );
      for (const m of t.mappings) {
        expect(labels.has(m.sourceLabel), `${t.scaleSigla}: ${m.sourceLabel}`).toBe(
          true,
        );
      }
    }
  });

  it("has no duplicate rows", () => {
    for (const t of BRAND_OFFICIAL_TABLES_V1) {
      const seen = new Set(t.mappings.map((m) => m.sourceLabel));
      expect(seen.size).toBe(t.mappings.length);
    }
  });
});

describe("adidas official chart on SUA", () => {
  const scale = ATELIER_SCALES_BY_SIGLA.get("SUA");
  const tables = [
    ...GENERIC_CONVERSION_TABLES_V1.filter((t) => t.scaleSigla === "SUA"),
    ...BRAND_OFFICIAL_TABLES_V1.filter((t) => t.scaleSigla === "SUA"),
  ];

  function convert(label: string, vendor: string | null) {
    if (scale === undefined) throw new Error("SUA missing from seed");
    const parsed = parseLabel(label, scale);
    if (parsed === null) return null;
    return lookupConversion("SUA", vendor, parsed.canonical, tables);
  }

  it("uses the manufacturer chart for adidas products", () => {
    const r = convert("4", "Adidas Originals");
    expect(r?.fromBrandSpecific).toBe(true);
    expect(r?.matrix).toMatchObject({ us: "4.5", eu: "36⅔", uk: "4" });
  });

  it("corrects the half-size drift of the in-house table", () => {
    // The Atelier table maps UK 4 to EU 37 / US 5; adidas publishes
    // EU 36⅔ / US 4.5. Same product, half a size apart.
    const generic = convert("4", "Some Other Brand");
    expect(generic?.fromBrandSpecific).toBe(false);
    expect(generic?.matrix.us).toBe("5");
    expect(convert("4", "Adidas Originals")?.matrix.us).toBe("4.5");
  });

  it("matches the vendor case-insensitively", () => {
    expect(convert("5", "adidas originals")?.fromBrandSpecific).toBe(true);
  });

  it("fills the half sizes the in-house table leaves empty", () => {
    for (const label of ["3½", "4½", "5½", "6½"]) {
      const generic = convert(label, "Some Other Brand");
      expect(generic?.matrix.eu, `generic ${label}`).toBeNull();

      const official = convert(label, "Adidas Originals");
      expect(official?.fromBrandSpecific).toBe(true);
      expect(official?.matrix.eu, `official ${label}`).toBeTruthy();
      expect(official?.matrix.us).toBeTruthy();
      expect(official?.matrix.cm).toBeTruthy();
    }
  });

  it("keeps the published ladder monotonic", () => {
    const rows = adidas?.mappings ?? [];
    const mm = rows.map((m) => m.jpMm ?? 0);
    for (let i = 1; i < mm.length; i++) {
      expect(mm[i] as number).toBeGreaterThan(mm[i - 1] as number);
    }
  });

  it("falls back to the generic table for UK 3, which adidas does not list", () => {
    const r = convert("3", "Adidas Originals");
    expect(r?.fromBrandSpecific).toBe(false);
  });
});
