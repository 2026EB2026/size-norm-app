import { describe, expect, it } from "vitest";

import { buildBulkSearchQuery } from "../../app/lib/shopify/paginate";

describe("buildBulkSearchQuery", () => {
  it("returns null when no filter provided", () => {
    expect(buildBulkSearchQuery({})).toBeNull();
  });

  it("returns null when both filters are empty strings", () => {
    expect(buildBulkSearchQuery({ scaleSigla: "", brand: "" })).toBeNull();
  });

  it("returns null when both filters are null", () => {
    expect(
      buildBulkSearchQuery({ scaleSigla: null, brand: null }),
    ).toBeNull();
  });

  it("builds vendor filter for brand-only", () => {
    expect(buildBulkSearchQuery({ brand: "Gucci" })).toBe('vendor:"Gucci"');
  });

  it("quotes brand names with spaces", () => {
    expect(buildBulkSearchQuery({ brand: "Saint Laurent" })).toBe(
      'vendor:"Saint Laurent"',
    );
  });

  it("escapes double-quotes in brand names", () => {
    expect(buildBulkSearchQuery({ brand: 'Quote"Brand' })).toBe(
      'vendor:"Quote\\"Brand"',
    );
  });

  it("builds metafield filter for scaleSigla-only", () => {
    expect(buildBulkSearchQuery({ scaleSigla: "G" })).toBe(
      'metafields.size_norm.scale_sigla:"G"',
    );
  });

  it("preserves # in kid sigle (#BK)", () => {
    expect(buildBulkSearchQuery({ scaleSigla: "#BK" })).toBe(
      'metafields.size_norm.scale_sigla:"#BK"',
    );
  });

  it("combines brand + scale with AND", () => {
    expect(buildBulkSearchQuery({ brand: "Gucci", scaleSigla: "G" })).toBe(
      'vendor:"Gucci" AND metafields.size_norm.scale_sigla:"G"',
    );
  });
});
