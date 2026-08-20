import { describe, expect, it } from "vitest";

import { parseProductIdInput } from "../../app/lib/processor/diagnose";

describe("parseProductIdInput", () => {
  it("accepts a bare numeric id", () => {
    expect(parseProductIdInput("8009075490918")).toBe("8009075490918");
  });

  it("trims surrounding whitespace", () => {
    expect(parseProductIdInput("  8009075490918 ")).toBe("8009075490918");
  });

  it("accepts a product GID", () => {
    expect(parseProductIdInput("gid://shopify/Product/8009075490918")).toBe(
      "8009075490918",
    );
  });

  it("accepts a full admin URL", () => {
    expect(
      parseProductIdInput(
        "https://admin.shopify.com/store/size-norm-dev/products/8009075490918",
      ),
    ).toBe("8009075490918");
  });

  it("accepts an admin URL with query string", () => {
    expect(
      parseProductIdInput(
        "https://admin.shopify.com/store/size-norm-dev/products/8009075490918?selectedVariantId=42",
      ),
    ).toBe("8009075490918");
  });

  it("accepts a bare path", () => {
    expect(parseProductIdInput("/products/12345")).toBe("12345");
  });

  it("returns null for empty input", () => {
    expect(parseProductIdInput("")).toBe(null);
    expect(parseProductIdInput("   ")).toBe(null);
  });

  it("returns null when no id is present", () => {
    expect(parseProductIdInput("scarpa prova 5")).toBe(null);
    expect(
      parseProductIdInput("https://admin.shopify.com/store/x/products/"),
    ).toBe(null);
  });

  it("does not confuse a variant-only URL for a product id", () => {
    expect(parseProductIdInput("/variants/999")).toBe(null);
  });
});
