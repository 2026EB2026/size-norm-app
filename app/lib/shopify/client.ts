/**
 * Thin typed wrappers around the Shopify Admin GraphQL client returned by
 * `authenticate.admin(request)`. Each wrapper hides the GraphQL query string
 * and surfaces a Promise of structured data, throwing on user errors so
 * callers can fail loudly (no silent .catch).
 */

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import {
  CREATE_METAFIELD_DEFINITION,
  DELETE_METAFIELDS,
  GET_METAFIELD_DEFINITION_ACCESS,
  GET_PRODUCT_DIAGNOSTICS,
  GET_PRODUCT_FOR_PROCESSING,
  SET_METAFIELDS,
  UPDATE_METAFIELD_DEFINITION_ACCESS,
  UPDATE_PRODUCT,
} from "./queries";

/** Namespace every metafield this app owns lives in. */
export const METAFIELD_NAMESPACE = "size_norm";

/**
 * The `admin` object returned by `authenticate.admin(request)` — re-exported
 * here so call sites in this package can depend on a stable name without
 * threading the long Shopify type through every signature.
 */
export type Admin = AdminApiContext;

/**
 * One Shopify variant returned by {@link getProductForProcessing}. The
 * `selectedOptions` array has one entry per option of the parent product
 * (size, color, …); we'll find the "size" option by name during processing.
 */
export interface ShopifyProductVariant {
  id: string;
  title: string;
  selectedOptions: { name: string; value: string }[];
}

export interface ShopifyProduct {
  id: string;
  title: string;
  vendor: string | null;
  productType: string | null;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  tags: string[];
  /** product metafield `size_norm.gender` value, or null when missing. */
  gender: string | null;
  /** product metafield `size_norm.scale_sigla` value, or null when missing. */
  scaleSigla: string | null;
  /**
   * Product metafield `size_norm.age_category` value, or null when missing.
   * Used by the processor to auto-derive a brand-official scale sigla for
   * kid products (defaults to "adult" when null). Optional — only needed
   * when the merchant uses brand-official scales.
   */
  ageCategory: string | null;
  variants: ShopifyProductVariant[];
}

/**
 * Fetches a product + the two relevant metafields + variants. Used by the
 * webhook handler to assemble the input to the processor.
 *
 * Throws if the product doesn't exist or the response is malformed.
 */
export async function getProductForProcessing(
  admin: Admin,
  productGid: string,
): Promise<ShopifyProduct> {
  const response = await admin.graphql(GET_PRODUCT_FOR_PROCESSING, {
    variables: { id: productGid },
  });
  const json = (await response.json()) as {
    data?: {
      product?: {
        id: string;
        title: string;
        vendor: string | null;
        productType: string | null;
        status: "ACTIVE" | "DRAFT" | "ARCHIVED";
        tags: string[];
        gender: { value: string } | null;
        scaleSigla: { value: string } | null;
        ageCategory: { value: string } | null;
        variants: { nodes: ShopifyProductVariant[] };
      };
    };
    errors?: { message: string }[];
  };

  if (json.errors !== undefined && json.errors.length > 0) {
    throw new Error(
      `GraphQL errors fetching product ${productGid}: ${json.errors
        .map((e) => e.message)
        .join("; ")}`,
    );
  }

  const p = json.data?.product;
  if (p === undefined || p === null) {
    throw new Error(`Product ${productGid} not found`);
  }

  return {
    id: p.id,
    title: p.title,
    vendor: p.vendor,
    productType: p.productType,
    status: p.status,
    tags: p.tags,
    gender: p.gender?.value ?? null,
    scaleSigla: p.scaleSigla?.value ?? null,
    ageCategory: p.ageCategory?.value ?? null,
    variants: p.variants.nodes,
  };
}

/** Current `size_norm` metafield state for a product, for diagnostics. */
export interface ProductMetafieldState {
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  conversionStatus: string | null;
  lastProcessedAt: string | null;
  displayScale: string | null;
  /** Variant id → true when a `size_norm.matrix` value is present. */
  variantsWithMatrix: Record<string, boolean>;
}

/**
 * Reads the metafields previously written by the processor. Used only by
 * the diagnostics page; never part of the processing path.
 */
export async function getProductMetafieldState(
  admin: Admin,
  productGid: string,
): Promise<ProductMetafieldState | null> {
  const response = await admin.graphql(GET_PRODUCT_DIAGNOSTICS, {
    variables: { id: productGid },
  });
  const json = (await response.json()) as {
    data?: {
      product?: {
        status: "ACTIVE" | "DRAFT" | "ARCHIVED";
        conversionStatus: { value: string } | null;
        lastProcessedAt: { value: string } | null;
        displayScale: { value: string } | null;
        variants: {
          nodes: { id: string; matrix: { value: string } | null }[];
        };
      };
    };
    errors?: { message: string }[];
  };
  if (json.errors !== undefined && json.errors.length > 0) {
    throw new Error(
      `GraphQL errors reading diagnostics: ${json.errors
        .map((e) => e.message)
        .join("; ")}`,
    );
  }
  const p = json.data?.product;
  if (p === undefined || p === null) return null;

  const variantsWithMatrix: Record<string, boolean> = {};
  for (const v of p.variants.nodes) {
    variantsWithMatrix[v.id] =
      v.matrix !== null && v.matrix.value.trim().length > 0;
  }
  return {
    status: p.status,
    conversionStatus: p.conversionStatus?.value ?? null,
    lastProcessedAt: p.lastProcessedAt?.value ?? null,
    displayScale: p.displayScale?.value ?? null,
    variantsWithMatrix,
  };
}

/** A single metafield write request. */
export interface MetafieldWrite {
  ownerId: string;
  namespace: string;
  key: string;
  type: string;
  value: string;
}

/**
 * Maximum number of metafields Shopify accepts in a single `metafieldsSet`
 * call. Documented limit as of API 2025-10. Exceeding it returns a variable
 * coercion error (HTTP 200, `errors` populated in body).
 *
 * https://shopify.dev/docs/api/admin-graphql/latest/mutations/metafieldsSet
 */
const METAFIELDS_SET_BATCH_LIMIT = 25;

/**
 * Writes a batch of metafields (mixed product + variant scope). Throws if
 * Shopify returns userErrors.
 *
 * The Shopify `metafieldsSet` mutation only accepts up to 25 metafields per
 * call, so we chunk the input into successive batches of {@link
 * METAFIELDS_SET_BATCH_LIMIT}. Each batch is atomic at the mutation level
 * (Shopify rolls back its own batch on error), but the batches themselves
 * are not transactional across each other — if batch N+1 fails after batch
 * N has been committed, the caller has to surface a partial-success state
 * via alerts. We accept that trade-off: re-running the processor is
 * idempotent for the same input.
 */
export async function setMetafields(
  admin: Admin,
  writes: MetafieldWrite[],
): Promise<void> {
  // Shopify rejects a blank value on a typed metafield with
  // `[INVALID_VALUE] Value can't be blank`, and because the rejection is
  // per-mutation it takes the whole batch of 25 down with it — one empty
  // string silently costs up to 24 good writes. Clearing a metafield is
  // `deleteMetafields`, not an empty write, so anything blank that reaches
  // here is a caller bug: drop it loudly rather than lose the batch.
  const safe = writes.filter((w) => w.value.trim().length > 0);
  if (safe.length !== writes.length) {
    const dropped = writes
      .filter((w) => w.value.trim().length === 0)
      .map((w) => `${w.namespace}.${w.key}`);
    // eslint-disable-next-line no-undef, no-console
    console.warn(
      `[size-norm] dropped ${dropped.length} blank metafield write(s): ${dropped.join(", ")}`,
    );
  }
  if (safe.length === 0) return;

  for (let i = 0; i < safe.length; i += METAFIELDS_SET_BATCH_LIMIT) {
    const batch = safe.slice(i, i + METAFIELDS_SET_BATCH_LIMIT);
    const response = await admin.graphql(SET_METAFIELDS, {
      variables: { metafields: batch },
    });
    const json = (await response.json()) as {
      data?: {
        metafieldsSet?: {
          userErrors?: { field: string[]; message: string; code: string }[];
        };
      };
      errors?: { message: string }[];
    };
    if (json.errors !== undefined && json.errors.length > 0) {
      throw new Error(
        `GraphQL errors setting metafields (batch ${i}-${i + batch.length}): ${json.errors
          .map((e) => e.message)
          .join("; ")}`,
      );
    }
    const userErrors = json.data?.metafieldsSet?.userErrors ?? [];
    if (userErrors.length > 0) {
      throw new Error(
        `metafieldsSet userErrors (batch ${i}-${i + batch.length}): ${userErrors
          .map((e) => `[${e.code}] ${e.field?.join(".") ?? ""}: ${e.message}`)
          .join("; ")}`,
      );
    }
  }
}

/** Identifies one metafield to remove. */
export interface MetafieldTarget {
  ownerId: string;
  namespace: string;
  key: string;
}

/**
 * Removes metafields. Used to clear a value, which cannot be done by writing
 * an empty string.
 *
 * Deleting a metafield that does not exist is not an error worth failing a
 * whole product over, so user errors are logged and swallowed — unlike
 * {@link setMetafields}, nothing downstream depends on the removal having
 * happened.
 */
export async function deleteMetafields(
  admin: Admin,
  targets: MetafieldTarget[],
): Promise<void> {
  if (targets.length === 0) return;

  for (let i = 0; i < targets.length; i += METAFIELDS_SET_BATCH_LIMIT) {
    const batch = targets.slice(i, i + METAFIELDS_SET_BATCH_LIMIT);
    try {
      const response = await admin.graphql(DELETE_METAFIELDS, {
        variables: { metafields: batch },
      });
      const json = (await response.json()) as {
        data?: {
          metafieldsDelete?: { userErrors?: { message: string }[] };
        };
      };
      const userErrors = json.data?.metafieldsDelete?.userErrors ?? [];
      if (userErrors.length > 0) {
        // eslint-disable-next-line no-undef, no-console
        console.warn(
          `[size-norm] metafieldsDelete userErrors: ${userErrors
            .map((e) => e.message)
            .join("; ")}`,
        );
      }
    } catch (e) {
      // eslint-disable-next-line no-undef, no-console
      console.warn(
        "[size-norm] metafieldsDelete failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }
}

/**
 * Updates product status and/or tags via `productUpdate`. Pass only the
 * fields you want to change; others are preserved.
 */
export async function updateProductStatusAndTags(
  admin: Admin,
  productGid: string,
  patch: { status?: "ACTIVE" | "DRAFT" | "ARCHIVED"; tags?: string[] },
): Promise<void> {
  const input: Record<string, unknown> = { id: productGid };
  if (patch.status !== undefined) input.status = patch.status;
  if (patch.tags !== undefined) input.tags = patch.tags;

  const response = await admin.graphql(UPDATE_PRODUCT, {
    variables: { input },
  });
  const json = (await response.json()) as {
    data?: {
      productUpdate?: {
        userErrors?: { field: string[]; message: string }[];
      };
    };
    errors?: { message: string }[];
  };
  if (json.errors !== undefined && json.errors.length > 0) {
    throw new Error(
      `GraphQL errors updating product: ${json.errors
        .map((e) => e.message)
        .join("; ")}`,
    );
  }
  const userErrors = json.data?.productUpdate?.userErrors ?? [];
  if (userErrors.length > 0) {
    throw new Error(
      `productUpdate userErrors: ${userErrors
        .map((e) => `${e.field?.join(".") ?? ""}: ${e.message}`)
        .join("; ")}`,
    );
  }
}

/**
 * Idempotently creates a single Metafield Definition. Treats the `TAKEN`
 * error code as success (definition already exists from a previous install).
 */
export async function createMetafieldDefinitionIdempotent(
  admin: Admin,
  definition: {
    name: string;
    namespace: string;
    key: string;
    description?: string;
    type: string;
    ownerType: "PRODUCT" | "PRODUCTVARIANT";
    /** Grant Liquid / Storefront API read access. */
    storefront?: boolean;
  },
): Promise<{ created: boolean }> {
  const { storefront, ...rest } = definition;
  const response = await admin.graphql(CREATE_METAFIELD_DEFINITION, {
    variables: {
      definition:
        storefront === true
          ? { ...rest, access: { storefront: "PUBLIC_READ" } }
          : rest,
    },
  });
  const json = (await response.json()) as {
    data?: {
      metafieldDefinitionCreate?: {
        createdDefinition?: { id: string } | null;
        userErrors?: { field: string[]; message: string; code: string }[];
      };
    };
    errors?: { message: string }[];
  };
  if (json.errors !== undefined && json.errors.length > 0) {
    throw new Error(
      `GraphQL errors creating metafield definition: ${json.errors
        .map((e) => e.message)
        .join("; ")}`,
    );
  }
  const userErrors = json.data?.metafieldDefinitionCreate?.userErrors ?? [];
  for (const e of userErrors) {
    if (e.code === "TAKEN") {
      // Definition already exists — that's the idempotent path.
      return { created: false };
    }
  }
  if (userErrors.length > 0) {
    throw new Error(
      `metafieldDefinitionCreate userErrors: ${userErrors
        .map((e) => `[${e.code}] ${e.field?.join(".") ?? ""}: ${e.message}`)
        .join("; ")}`,
    );
  }
  return {
    created:
      json.data?.metafieldDefinitionCreate?.createdDefinition !== null &&
      json.data?.metafieldDefinitionCreate?.createdDefinition !== undefined,
  };
}

/**
 * Definitions registered on first install. Order matches the metafield schema
 * defined in section 4 of the project handover.
 */
export const METAFIELD_DEFINITIONS = [
  {
    name: "Size Norm — Gender",
    namespace: "size_norm",
    key: "gender",
    description: "Gender of the product (men / women / unisex / kid).",
    type: "single_line_text_field",
    ownerType: "PRODUCT" as const,
  },
  {
    name: "Size Norm — Scale sigla",
    namespace: "size_norm",
    key: "scale_sigla",
    description:
      "Manual override of the scale to use. Leave empty for auto-derivation from vendor + gender + age_category (e.g. asics-men-adult).",
    type: "single_line_text_field",
    ownerType: "PRODUCT" as const,
  },
  {
    name: "Size Norm — Age category",
    namespace: "size_norm",
    key: "age_category",
    description:
      "adult | crib | infant | toddler | pre-school | youth | grade-school | junior | big-kids. Defaults to 'adult' when empty.",
    type: "single_line_text_field",
    ownerType: "PRODUCT" as const,
  },
  {
    name: "Size Norm — Conversion status",
    namespace: "size_norm",
    key: "conversion_status",
    description: "System-managed: ok | error | partial_override.",
    type: "single_line_text_field",
    ownerType: "PRODUCT" as const,
  },
  {
    name: "Size Norm — Last processed at",
    namespace: "size_norm",
    key: "last_processed_at",
    description: "System-managed: ISO timestamp of last successful processing.",
    type: "date_time",
    ownerType: "PRODUCT" as const,
  },
  {
    name: "Size Norm — Display scale",
    namespace: "size_norm",
    key: "display_scale",
    description:
      "Per-product override for the PDP \"main\" scale: US|EU|UK|CM|JP_MM. Set by the processor from the per-brand rules in app settings; falls back to the block's default_scale when empty.",
    type: "single_line_text_field",
    ownerType: "PRODUCT" as const,
    storefront: true,
  },
  // Variant-level (one row per scale column)
  {
    name: "Size Norm — US",
    namespace: "size_norm",
    key: "us",
    type: "single_line_text_field",
    ownerType: "PRODUCTVARIANT" as const,
    storefront: true,
  },
  {
    name: "Size Norm — EU",
    namespace: "size_norm",
    key: "eu",
    type: "single_line_text_field",
    ownerType: "PRODUCTVARIANT" as const,
    storefront: true,
  },
  {
    name: "Size Norm — UK",
    namespace: "size_norm",
    key: "uk",
    type: "single_line_text_field",
    ownerType: "PRODUCTVARIANT" as const,
    storefront: true,
  },
  {
    name: "Size Norm — CM",
    namespace: "size_norm",
    key: "cm",
    description:
      "Foot length in centimetres (preserves .5 increments and brand ranges).",
    type: "single_line_text_field",
    ownerType: "PRODUCTVARIANT" as const,
    storefront: true,
  },
  {
    name: "Size Norm — JP mondopoint (mm)",
    namespace: "size_norm",
    key: "jp_mm",
    type: "number_integer",
    ownerType: "PRODUCTVARIANT" as const,
    storefront: true,
  },
  {
    name: "Size Norm — Matrix (JSON)",
    namespace: "size_norm",
    key: "matrix",
    description: "Full {us, eu, uk, cm, jpMm} object for fast PDP rendering.",
    type: "json",
    ownerType: "PRODUCTVARIANT" as const,
    storefront: true,
  },
  {
    name: "Size Norm — Source label",
    namespace: "size_norm",
    key: "source_label",
    description: "The original variant option value before normalization.",
    type: "single_line_text_field",
    ownerType: "PRODUCTVARIANT" as const,
    storefront: true,
  },
  {
    name: "Size Norm — Manual override",
    namespace: "size_norm",
    key: "manual_override",
    description: "Set to true when merchant forced the conversion values.",
    type: "boolean",
    ownerType: "PRODUCTVARIANT" as const,
    storefront: true,
  },
];

/**
 * Iterates {@link METAFIELD_DEFINITIONS} and creates each one idempotently.
 * Called from {@link ensureSeed} on first install.
 */
export async function ensureMetafieldDefinitions(admin: Admin): Promise<{
  total: number;
  created: number;
  repaired: number;
}> {
  let created = 0;
  for (const def of METAFIELD_DEFINITIONS) {
    const result = await createMetafieldDefinitionIdempotent(admin, def);
    if (result.created) created++;
  }
  const repaired = await repairStorefrontAccess(admin);
  return { total: METAFIELD_DEFINITIONS.length, created, repaired };
}

/**
 * Grants Liquid / Storefront read access to the definitions that the PDP
 * block reads, for installs whose definitions were created before we asked
 * for it.
 *
 * `metafieldDefinitionCreate` is a no-op once a definition exists (it returns
 * `TAKEN`), so a shop installed earlier keeps `storefront: NONE` forever —
 * and with NONE the theme's `variant.metafields.size_norm.matrix` reads as
 * empty, which makes the block render its "no conversion available" state on
 * the storefront even though the data is there in the admin.
 *
 * Reads the current access first so the common case (already correct) costs
 * two queries and no mutations. Failures are swallowed: a shop that can't be
 * repaired must still finish loading.
 */
export async function repairStorefrontAccess(admin: Admin): Promise<number> {
  const ownerTypes = ["PRODUCT", "PRODUCTVARIANT"] as const;
  let repaired = 0;

  for (const ownerType of ownerTypes) {
    const wanted = new Set(
      METAFIELD_DEFINITIONS.filter(
        (d) => d.ownerType === ownerType && d.storefront === true,
      ).map((d) => d.key),
    );
    if (wanted.size === 0) continue;

    try {
      const response = await admin.graphql(GET_METAFIELD_DEFINITION_ACCESS, {
        variables: { ownerType, namespace: METAFIELD_NAMESPACE },
      });
      const json = (await response.json()) as {
        data?: {
          metafieldDefinitions?: {
            nodes?: { key: string; access?: { storefront?: string } }[];
          };
        };
      };
      const nodes = json.data?.metafieldDefinitions?.nodes ?? [];

      for (const node of nodes) {
        if (!wanted.has(node.key)) continue;
        if (node.access?.storefront === "PUBLIC_READ") continue;
        const updated = await admin.graphql(UPDATE_METAFIELD_DEFINITION_ACCESS, {
          variables: {
            definition: {
              namespace: METAFIELD_NAMESPACE,
              key: node.key,
              ownerType,
              access: { storefront: "PUBLIC_READ" },
            },
          },
        });
        const updatedJson = (await updated.json()) as {
          data?: {
            metafieldDefinitionUpdate?: {
              userErrors?: { code: string; message: string }[];
            };
          };
        };
        const errors =
          updatedJson.data?.metafieldDefinitionUpdate?.userErrors ?? [];
        if (errors.length === 0) {
          repaired++;
        } else {
          // eslint-disable-next-line no-undef, no-console
          console.warn(
            `[size-norm] could not grant storefront access to ${METAFIELD_NAMESPACE}.${node.key}:`,
            errors.map((e) => `[${e.code}] ${e.message}`).join("; "),
          );
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-undef, no-console
      console.warn(
        `[size-norm] storefront-access repair failed for ${ownerType}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  return repaired;
}
