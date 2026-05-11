import { describe, expect, it } from "vitest";

import { validateGenderMatch } from "../../app/lib/conversion/validate-gender";

describe("validateGenderMatch", () => {
  it("men+men matches", () => {
    expect(validateGenderMatch("men", "men")).toBe(true);
  });

  it("women+women matches", () => {
    expect(validateGenderMatch("women", "women")).toBe(true);
  });

  it("men+women does NOT match", () => {
    expect(validateGenderMatch("men", "women")).toBe(false);
  });

  it("women+men does NOT match", () => {
    expect(validateGenderMatch("women", "men")).toBe(false);
  });

  it("unisex scale accepts any product gender — men", () => {
    expect(validateGenderMatch("men", "unisex")).toBe(true);
  });

  it("unisex scale accepts any product gender — women", () => {
    expect(validateGenderMatch("women", "unisex")).toBe(true);
  });

  it("unisex scale accepts any product gender — kid", () => {
    expect(validateGenderMatch("kid", "unisex")).toBe(true);
  });

  it("unisex scale accepts unisex product", () => {
    expect(validateGenderMatch("unisex", "unisex")).toBe(true);
  });

  it("kid scale accepts any product gender — men (e.g. mislabeled kid item)", () => {
    expect(validateGenderMatch("men", "kid")).toBe(true);
  });

  it("kid scale accepts kid product", () => {
    expect(validateGenderMatch("kid", "kid")).toBe(true);
  });

  it("men scale rejects unisex product (strictness)", () => {
    expect(validateGenderMatch("unisex", "men")).toBe(false);
  });

  it("women scale rejects kid product", () => {
    expect(validateGenderMatch("kid", "women")).toBe(false);
  });
});
