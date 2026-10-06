import { describe, expect, it } from "vitest";

import { GUIDE_UFFICIALI_TABLES } from "../../app/lib/conversion/guide-ufficiali-tables";
import { ATELIER_SCALES_V1 } from "../../app/lib/conversion/scales-seed";

const labelsBySigla = new Map(
  ATELIER_SCALES_V1.map((s) => [s.sigla, new Set(s.labels)]),
);

describe("GUIDE_UFFICIALI_TABLES", () => {
  it("only targets Atelier scales that exist", () => {
    for (const table of GUIDE_UFFICIALI_TABLES) {
      expect(labelsBySigla.has(table.scaleSigla)).toBe(true);
    }
  });

  it("keys every row on a label the scale actually has", () => {
    // A sourceLabel the scale can't produce is dead weight: parseLabel would
    // never hand it to lookupConversion.
    for (const table of GUIDE_UFFICIALI_TABLES) {
      const labels = labelsBySigla.get(table.scaleSigla);
      for (const m of table.mappings) {
        expect(labels?.has(m.sourceLabel), `${table.scaleSigla} ${m.sourceLabel}`).toBe(true);
      }
    }
  });

  it("never repeats a sourceLabel inside one table", () => {
    for (const table of GUIDE_UFFICIALI_TABLES) {
      const seen = new Set(table.mappings.map((m) => m.sourceLabel));
      expect(seen.size, `${table.scaleSigla}/${table.brand}`).toBe(
        table.mappings.length,
      );
    }
  });

  it("carries a brand on every table", () => {
    // A null brand would make these shadow the generic table for every vendor.
    for (const table of GUIDE_UFFICIALI_TABLES) {
      expect(table.brand).toBeTruthy();
    }
  });

  it("treats the Isabel Marant label as FR, not IT", () => {
    // Marant 39 = IT 38. Reading the brand's own label as an Italian size
    // would shift every Marant product by a full size.
    const it = GUIDE_UFFICIALI_TABLES.find(
      (t) => t.brand === "Isabel Marant" && t.scaleSigla === "I",
    );
    expect(it).toBeDefined();
    const row = it?.mappings.find((m) => m.uk === "2");
    expect(row?.sourceLabel).toBe("34");
    expect(row?.eu).toBe("34");
  });

  it("uses the Italian men's convention, not Brannock", () => {
    // Every men's guide in the pack agrees: IT 39 = UK 5 = US 6. The generic
    // MEN_MASTER places IT 39 at UK 6 / US 7 — a full size out.
    const g = GUIDE_UFFICIALI_TABLES.find(
      (t) => t.brand === "Bottega Veneta" && t.scaleSigla === "G",
    );
    const row = g?.mappings.find((m) => m.sourceLabel === "39");
    expect(row?.uk).toBe("5");
    expect(row?.us).toBe("6");
  });
});
