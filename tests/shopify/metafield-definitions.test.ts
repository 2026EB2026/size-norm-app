import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { METAFIELD_DEFINITIONS } from "../../app/lib/shopify/client";

const EXTENSION_DIR = join(process.cwd(), "extensions", "size-norm-pdp");

/** Every `size_norm.<key>` the theme extension reads from Liquid. */
function keysReadByTheme(): Set<string> {
  const keys = new Set<string>();
  for (const sub of ["blocks", "snippets"]) {
    const dir = join(EXTENSION_DIR, sub);
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), "utf8");
      for (const m of source.matchAll(/metafields\.size_norm\.(\w+)/g)) {
        const key = m[1];
        if (key !== undefined) keys.add(key);
      }
    }
  }
  return keys;
}

describe("metafield definitions vs the theme extension", () => {
  const byKey = new Map(METAFIELD_DEFINITIONS.map((d) => [d.key, d]));

  it("the theme actually reads some size_norm metafields", () => {
    // Guards the regex itself: a silent zero would make the test below pass
    // while checking nothing.
    expect(keysReadByTheme().size).toBeGreaterThan(0);
  });

  it("every key the theme reads is granted storefront access", () => {
    // Without `storefront: PUBLIC_READ` on the definition, Liquid reads the
    // metafield as empty and the PDP block renders its no-data state on the
    // live storefront — with the data sitting right there in the admin.
    for (const key of keysReadByTheme()) {
      const def = byKey.get(key);
      expect(def, `no definition declares size_norm.${key}`).toBeDefined();
      expect(
        def?.storefront,
        `size_norm.${key} is read by the theme but not exposed to the storefront`,
      ).toBe(true);
    }
  });

  it("keeps the app's internal bookkeeping fields private", () => {
    // These drive processing decisions and have no business being readable
    // by any storefront visitor.
    for (const key of [
      "gender",
      "scale_sigla",
      "age_category",
      "conversion_status",
      "last_processed_at",
    ]) {
      expect(byKey.get(key)?.storefront).toBeUndefined();
    }
  });

  it("has no duplicate namespace/key/ownerType triples", () => {
    const seen = new Set(
      METAFIELD_DEFINITIONS.map((d) => `${d.ownerType}:${d.namespace}.${d.key}`),
    );
    expect(seen.size).toBe(METAFIELD_DEFINITIONS.length);
  });
});
