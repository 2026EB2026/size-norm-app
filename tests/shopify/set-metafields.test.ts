import { describe, expect, it } from "vitest";

import {
  setMetafields,
  type Admin,
  type MetafieldWrite,
} from "../../app/lib/shopify/client";

/** Captures every `metafields` variable passed to the Admin API. */
function fakeAdmin(): { admin: Admin; batches: MetafieldWrite[][] } {
  const batches: MetafieldWrite[][] = [];
  const admin = {
    graphql: async (_query: string, options?: { variables?: unknown }) => {
      const vars = options?.variables as { metafields: MetafieldWrite[] };
      batches.push(vars.metafields);
      return {
        json: async () => ({ data: { metafieldsSet: { userErrors: [] } } }),
      };
    },
  } as unknown as Admin;
  return { admin, batches };
}

function write(key: string, value: string): MetafieldWrite {
  return {
    ownerId: "gid://shopify/Product/1",
    namespace: "size_norm",
    key,
    type: "single_line_text_field",
    value,
  };
}

describe("setMetafields", () => {
  it("never sends a blank value to Shopify", async () => {
    // Regression: a single blank value is rejected with
    // `[INVALID_VALUE] Value can't be blank`, and the rejection takes down
    // the whole mutation — so one empty `display_scale` used to discard the
    // 24 good writes travelling with it, leaving products half-converted.
    const { admin, batches } = fakeAdmin();
    await setMetafields(admin, [
      write("us", "9"),
      write("display_scale", ""),
      write("eu", "42"),
    ]);

    const sent = batches.flat();
    expect(sent.map((w) => w.key)).toEqual(["us", "eu"]);
    expect(sent.every((w) => w.value.trim().length > 0)).toBe(true);
  });

  it("treats a whitespace-only value as blank", async () => {
    const { admin, batches } = fakeAdmin();
    await setMetafields(admin, [write("us", "   "), write("eu", "42")]);
    expect(batches.flat().map((w) => w.key)).toEqual(["eu"]);
  });

  it("sends nothing when every write is blank", async () => {
    const { admin, batches } = fakeAdmin();
    await setMetafields(admin, [write("display_scale", "")]);
    expect(batches).toHaveLength(0);
  });

  it("does nothing for an empty list", async () => {
    const { admin, batches } = fakeAdmin();
    await setMetafields(admin, []);
    expect(batches).toHaveLength(0);
  });

  it("chunks at Shopify's 25-metafield limit", async () => {
    const { admin, batches } = fakeAdmin();
    const writes = Array.from({ length: 57 }, (_, i) =>
      write(`k${i}`, String(i + 1)),
    );
    await setMetafields(admin, writes);

    expect(batches.map((b) => b.length)).toEqual([25, 25, 7]);
    expect(batches.flat()).toHaveLength(57);
  });

  it("chunks the surviving writes, not the original list", async () => {
    // Blanks are dropped before chunking, so a list of 26 with one blank
    // fits in a single batch instead of spilling into a second.
    const { admin, batches } = fakeAdmin();
    const writes = [
      ...Array.from({ length: 25 }, (_, i) => write(`k${i}`, String(i + 1))),
      write("display_scale", ""),
    ];
    await setMetafields(admin, writes);
    expect(batches.map((b) => b.length)).toEqual([25]);
  });

  it("throws when Shopify reports a user error", async () => {
    const admin = {
      graphql: async () => ({
        json: async () => ({
          data: {
            metafieldsSet: {
              userErrors: [
                { field: ["metafields", "2", "value"], message: "nope", code: "INVALID_VALUE" },
              ],
            },
          },
        }),
      }),
    } as unknown as Admin;

    await expect(setMetafields(admin, [write("us", "9")])).rejects.toThrow(
      /metafieldsSet userErrors/,
    );
  });
});
