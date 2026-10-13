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

  it("leaves Isabel Marant and Kenzo to the Italian master", () => {
    // Both guides are keyed on the brand's French label, but the ERP loads
    // these two already converted to IT (confirmed by the merchant on
    // 12/10/2026). A chart built on FR labels no longer lines up with IT
    // ones, so these brands fall back to the generic table like any other
    // Italian-labelled product rather than being shifted a size.
    const shifted = GUIDE_UFFICIALI_TABLES.filter(
      (t) => t.brand === "Isabel Marant" || t.brand === "Kenzo",
    );
    expect(shifted).toHaveLength(0);
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

describe("source-verified guides", () => {
  it("imports Moschino, whose published ladder the checker had rejected", () => {
    // moschino.com publishes IT 43 = UK 9.5, skipping 42.5 — verified at the
    // source on 2026-10-13, so the table is imported as published instead of
    // being thrown out over the brand's own irregularity.
    const t = GUIDE_UFFICIALI_TABLES.find(
      (x) => x.brand === "Moschino" && x.scaleSigla === "I",
    );
    expect(t).toBeDefined();
    expect(t?.mappings.find((m) => m.sourceLabel === "42")?.uk).toBe("9");
    // The IT 43 row drops out here for an unrelated reason: the Atelier scale
    // `I` stops at 42, so no product can ever carry that label.
    expect(t?.mappings.find((m) => m.sourceLabel === "43")).toBeUndefined();
  });

  it("keeps Bonpoint on the kid EU scales", () => {
    const siglas = GUIDE_UFFICIALI_TABLES.filter(
      (t) => t.brand === "Bonpoint",
    ).map((t) => t.scaleSigla);
    expect(siglas.length).toBeGreaterThan(0);
    for (const s of siglas) expect(["#BK", "#BL"]).toContain(s);
  });

  it("leaves Crocs out: its second column is a US kid code, not a UK size", () => {
    expect(
      GUIDE_UFFICIALI_TABLES.filter((t) => t.brand === "Crocs"),
    ).toHaveLength(0);
  });
});

describe("quarter sizes", () => {
  it("renders Dsquared2's quarters with the same glyph family as its halves", () => {
    // Givenchy and Dsquared2 publish UK 2¾ / 4¾ / 6¾. Rounding them to the
    // nearest half would collide with the row next door, so they are kept —
    // but a column mixing "2½" and "2.75" reads like a bug on the PDP.
    const t = GUIDE_UFFICIALI_TABLES.find(
      (x) => x.brand === "Dsquared2" && x.scaleSigla === "I",
    );
    expect(t?.mappings.find((m) => m.sourceLabel === "38")?.uk).toBe("4¾");
    expect(t?.mappings.find((m) => m.sourceLabel === "35")?.uk).toBe("2½");
  });

  it("keeps every published row, halves included", () => {
    // The brand writes its half sizes as "35H"; read literally those rows
    // match no scale label and silently vanished.
    const t = GUIDE_UFFICIALI_TABLES.find(
      (x) => x.brand === "Dsquared2" && x.scaleSigla === "I",
    );
    expect(t?.mappings).toHaveLength(13);
    expect(t?.mappings.find((m) => m.sourceLabel === "35½")).toBeDefined();
  });
});

describe("Tory Burch", () => {
  it("keeps the brand's half-size offset against the Italian convention", () => {
    // Tory Burch publishes US 5 = IT 35.5, where the Italian convention puts
    // US 5 at IT 35. Their products arrive on the US scale, so `R` is the
    // table that actually gets used.
    const r = GUIDE_UFFICIALI_TABLES.find(
      (t) => t.brand === "Tory Burch" && t.scaleSigla === "R",
    );
    expect(r).toBeDefined();
    expect(r?.mappings.find((m) => m.sourceLabel === "5")?.eu).toBe("35½");
    expect(r?.mappings.find((m) => m.sourceLabel === "8")?.eu).toBe("38½");
  });

  it("publishes no UK column, so none is invented", () => {
    const r = GUIDE_UFFICIALI_TABLES.find(
      (t) => t.brand === "Tory Burch" && t.scaleSigla === "R",
    );
    for (const m of r?.mappings ?? []) expect(m.uk).toBeNull();
  });
});
