import { describe, expect, it } from "vitest";

import {
  parseMarketScales,
  settingsFormSchema,
} from "../../app/lib/validators/settings";

describe("settingsFormSchema", () => {
  it("accepts a fully valid input", () => {
    const result = settingsFormSchema.safeParse({
      globalDisplayMode: "MAIN_PLUS_TABLE",
      globalScale: "EU",
      fractionFormat: "UNICODE",
      marketScalesJson: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown display mode", () => {
    expect(
      settingsFormSchema.safeParse({
        globalDisplayMode: "WHATEVER",
        globalScale: "EU",
        fractionFormat: "UNICODE",
        marketScalesJson: "",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown global scale", () => {
    expect(
      settingsFormSchema.safeParse({
        globalDisplayMode: "FULL_TABLE",
        globalScale: "INVALID",
        fractionFormat: "UNICODE",
        marketScalesJson: "",
      }).success,
    ).toBe(false);
  });
});

describe("parseMarketScales", () => {
  it("returns null for empty string", () => {
    expect(parseMarketScales("")).toBeNull();
  });

  it("returns null for whitespace-only", () => {
    expect(parseMarketScales("   ")).toBeNull();
  });

  it("parses a valid map", () => {
    const result = parseMarketScales(
      JSON.stringify({ IT: "EU", UK: "UK", US: "US", JP: "JP_MM" }),
    );
    expect(result).toEqual({ IT: "EU", UK: "UK", US: "US", JP: "JP_MM" });
  });

  it("throws on malformed JSON", () => {
    expect(() => parseMarketScales("not json")).toThrow();
  });

  it("throws on invalid market code", () => {
    expect(() =>
      parseMarketScales(JSON.stringify({ "invalid-key": "EU" })),
    ).toThrow();
  });

  it("throws on invalid source scale value", () => {
    expect(() => parseMarketScales(JSON.stringify({ IT: "MARS" }))).toThrow();
  });
});
