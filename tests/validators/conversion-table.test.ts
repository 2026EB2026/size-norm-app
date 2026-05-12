import { describe, expect, it } from "vitest";

import {
  conversionTableFormSchema,
  parseMappingsJson,
} from "../../app/lib/validators/conversion-table";

describe("conversionTableFormSchema", () => {
  it("accepts valid input with brand", () => {
    const result = conversionTableFormSchema.safeParse({
      scaleSigla: "G",
      brand: "Gucci",
      mappingsJson: "[]",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.brand).toBe("Gucci");
  });

  it("normalizes empty brand to null", () => {
    const result = conversionTableFormSchema.safeParse({
      scaleSigla: "G",
      brand: "",
      mappingsJson: "[]",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.brand).toBeNull();
  });

  it("rejects empty scaleSigla", () => {
    expect(
      conversionTableFormSchema.safeParse({
        scaleSigla: "",
        brand: null,
        mappingsJson: "[]",
      }).success,
    ).toBe(false);
  });

  it("rejects empty mappingsJson", () => {
    expect(
      conversionTableFormSchema.safeParse({
        scaleSigla: "G",
        brand: null,
        mappingsJson: "",
      }).success,
    ).toBe(false);
  });
});

describe("parseMappingsJson", () => {
  it("parses a valid mappings array", () => {
    const json = JSON.stringify([
      { sourceLabel: "41", us: "9", eu: "41", uk: "8", jpMm: 250 },
    ]);
    const result = parseMappingsJson(json);
    expect(result).toHaveLength(1);
    expect(result[0]?.us).toBe("9");
  });

  it("accepts null values for us/eu/uk and jpMm", () => {
    const json = JSON.stringify([
      { sourceLabel: "x", us: null, eu: null, uk: null, jpMm: null },
    ]);
    const result = parseMappingsJson(json);
    expect(result[0]?.us).toBeNull();
    expect(result[0]?.jpMm).toBeNull();
  });

  it("coerces numeric strings to integer jpMm", () => {
    const json = JSON.stringify([
      { sourceLabel: "x", us: "1", eu: "1", uk: "1", jpMm: "250" },
    ]);
    const result = parseMappingsJson(json);
    expect(result[0]?.jpMm).toBe(250);
  });

  it("throws on malformed JSON", () => {
    expect(() => parseMappingsJson("not json")).toThrow();
  });

  it("throws on missing required fields", () => {
    const json = JSON.stringify([{ sourceLabel: "x" }]); // missing us/eu/uk/jpMm
    expect(() => parseMappingsJson(json)).toThrow();
  });

  it("throws on negative jpMm", () => {
    const json = JSON.stringify([
      { sourceLabel: "x", us: "1", eu: "1", uk: "1", jpMm: -10 },
    ]);
    expect(() => parseMappingsJson(json)).toThrow();
  });

  it("throws on non-array root", () => {
    expect(() => parseMappingsJson(JSON.stringify({ foo: 1 }))).toThrow();
  });
});
