import { describe, expect, it } from "vitest";

import {
  aliasesToRaw,
  parseAliases,
  parseLabels,
  sizeScaleFormSchema,
} from "../../app/lib/validators/size-scale";

describe("parseLabels", () => {
  it("splits on newlines and trims each entry", () => {
    expect(parseLabels("38\n38.5\n39")).toEqual(["38", "38.5", "39"]);
  });

  it("skips empty lines", () => {
    expect(parseLabels("38\n\n39\n  \n40")).toEqual(["38", "39", "40"]);
  });

  it("handles Windows line endings", () => {
    expect(parseLabels("38\r\n39\r\n40")).toEqual(["38", "39", "40"]);
  });

  it("returns empty array for empty input", () => {
    expect(parseLabels("")).toEqual([]);
  });

  it("trims internal whitespace per line", () => {
    expect(parseLabels("  38  \n  39  ")).toEqual(["38", "39"]);
  });
});

describe("parseAliases", () => {
  it("parses `key=value` pairs", () => {
    expect(parseAliases("k10=K10\nk11=K11")).toEqual({ k10: "K10", k11: "K11" });
  });

  it("lowercases the key", () => {
    expect(parseAliases("K10=K10")).toEqual({ k10: "K10" });
  });

  it("skips lines without `=`", () => {
    expect(parseAliases("k10=K10\nnoeqhere\nk11=K11")).toEqual({
      k10: "K10",
      k11: "K11",
    });
  });

  it("skips lines with empty key or value", () => {
    expect(parseAliases("=K10\nk11=\nk12=K12")).toEqual({ k12: "K12" });
  });

  it("trims whitespace around key and value", () => {
    expect(parseAliases("  k10  =  K10  ")).toEqual({ k10: "K10" });
  });

  it("returns empty object for empty input", () => {
    expect(parseAliases("")).toEqual({});
  });
});

describe("aliasesToRaw — round-trips with parseAliases", () => {
  it("serializes a small map", () => {
    const map = { k10: "K10", k11: "K11" };
    const raw = aliasesToRaw(map);
    expect(parseAliases(raw)).toEqual(map);
  });

  it("returns empty string for empty map", () => {
    expect(aliasesToRaw({})).toBe("");
  });
});

describe("sizeScaleFormSchema", () => {
  const valid = {
    sigla: "TEST",
    name: "Test scale",
    gender: "MEN",
    sourceScale: "EU",
    labelsRaw: "38\n39\n40",
    aliasesRaw: "",
  };

  it("accepts valid input", () => {
    expect(sizeScaleFormSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects empty sigla", () => {
    expect(
      sizeScaleFormSchema.safeParse({ ...valid, sigla: "" }).success,
    ).toBe(false);
  });

  it("rejects empty name", () => {
    expect(
      sizeScaleFormSchema.safeParse({ ...valid, name: "" }).success,
    ).toBe(false);
  });

  it("rejects invalid gender", () => {
    expect(
      sizeScaleFormSchema.safeParse({ ...valid, gender: "OTHER" }).success,
    ).toBe(false);
  });

  it("rejects invalid sourceScale", () => {
    expect(
      sizeScaleFormSchema.safeParse({ ...valid, sourceScale: "MARS" }).success,
    ).toBe(false);
  });

  it("rejects empty labelsRaw", () => {
    expect(
      sizeScaleFormSchema.safeParse({ ...valid, labelsRaw: "" }).success,
    ).toBe(false);
  });

  it("accepts each valid SourceScale enum value", () => {
    for (const ss of ["US", "EU", "UK", "JP_MM", "DOUBLE", "MW_COMBINED"]) {
      expect(
        sizeScaleFormSchema.safeParse({ ...valid, sourceScale: ss }).success,
      ).toBe(true);
    }
  });
});
