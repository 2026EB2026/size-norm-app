import { describe, expect, it } from "vitest";

import { formatLabel } from "../../app/lib/conversion/format-label";

describe("formatLabel — UNICODE format", () => {
  it("formats whole numbers without decoration", () => {
    expect(formatLabel("42", "UNICODE")).toBe("42");
  });

  it("formats halves with ½", () => {
    expect(formatLabel("42.5", "UNICODE")).toBe("42½");
  });

  it("formats thirds with ⅓ and ⅔", () => {
    expect(formatLabel("42.333", "UNICODE")).toBe("42⅓");
    expect(formatLabel("42.667", "UNICODE")).toBe("42⅔");
  });

  it("formats quarters with ¼ and ¾", () => {
    expect(formatLabel("42.25", "UNICODE")).toBe("42¼");
    expect(formatLabel("42.75", "UNICODE")).toBe("42¾");
  });

  it("accepts comma as decimal separator", () => {
    expect(formatLabel("42,5", "UNICODE")).toBe("42½");
  });
});

describe("formatLabel — DECIMAL format", () => {
  it("formats whole numbers without decoration", () => {
    expect(formatLabel("42", "DECIMAL")).toBe("42");
  });

  it("formats halves with .5", () => {
    expect(formatLabel("42.5", "DECIMAL")).toBe("42.5");
  });

  it("formats thirds with .333 and .667", () => {
    expect(formatLabel("42.333", "DECIMAL")).toBe("42.333");
    expect(formatLabel("42.667", "DECIMAL")).toBe("42.667");
  });

  it("normalizes comma input", () => {
    expect(formatLabel("42,5", "DECIMAL")).toBe("42.5");
  });
});

describe("formatLabel — ASCII format", () => {
  it("formats whole numbers without decoration", () => {
    expect(formatLabel("42", "ASCII")).toBe("42");
  });

  it("formats halves with ' 1/2'", () => {
    expect(formatLabel("42.5", "ASCII")).toBe("42 1/2");
  });

  it("formats thirds with ' 1/3' and ' 2/3'", () => {
    expect(formatLabel("42.333", "ASCII")).toBe("42 1/3");
    expect(formatLabel("42.667", "ASCII")).toBe("42 2/3");
  });

  it("formats quarters with ' 1/4' and ' 3/4'", () => {
    expect(formatLabel("42.25", "ASCII")).toBe("42 1/4");
    expect(formatLabel("42.75", "ASCII")).toBe("42 3/4");
  });
});

describe("formatLabel — compound labels pass through", () => {
  it("preserves Hoka double-sizing token unchanged in UNICODE format", () => {
    expect(formatLabel("3.5/5", "UNICODE")).toBe("3.5/5");
  });

  it("preserves M/W combined token in DECIMAL format", () => {
    expect(formatLabel("M8/W9.5", "DECIMAL")).toBe("M8/W9.5");
  });

  it("preserves M/W combined with unicode half in ASCII format", () => {
    expect(formatLabel("M8½/W10½", "ASCII")).toBe("M8½/W10½");
  });
});

describe("formatLabel — pathological inputs", () => {
  it("returns the raw input verbatim if it cannot be parsed", () => {
    expect(formatLabel("not-a-number", "UNICODE")).toBe("not-a-number");
  });

  it("handles input with extra surrounding whitespace", () => {
    expect(formatLabel("  42.5  ", "UNICODE")).toBe("42½");
  });

  it("falls back to decimal output for unknown fractions", () => {
    expect(formatLabel("42.123", "UNICODE")).toBe("42.123");
  });

  it("returns whole number when fraction is effectively zero", () => {
    expect(formatLabel("42.0", "UNICODE")).toBe("42");
  });
});
