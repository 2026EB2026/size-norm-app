/**
 * Thin typed wrappers around the Shopify Admin GraphQL client returned by
 * `authenticate.admin(request)`. Each wrapper hides the GraphQL query string
 * and surfaces a Promise of structured data, throwing on user errors so
 * callers can fail loudly (no silent .catch).
 */

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import {
  CREATE_METAFIELD_DEFINITION,
  GET_PRODUCT_FOR_PROCESSING,
  SET_METAFIELDS,
  UPDATE_PRODUCT,
} from "./queries";

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

/** A single metafield write request. */
export interface MetafieldWrite {
  ownerId: string;
  namespace: string;
  key: string;
  type: string;
  value: string;
}

/**
 * Writes a batch of metafields (mixed product + variant scope). Throws if
 * Shopify returns userErrors.
 */
export async function setMetafields(
  admin: Admin,
  writes: MetafieldWrite[],
): Promise<void> {
  if (writes.length === 0) return;
  const response = await admin.graphql(SET_METAFIELDS, {
    variables: { metafields: writes },
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
      `GraphQL errors setting metafields: ${json.errors
        .map((e) => e.message)
        .join("; ")}`,
    );
  }
  const userErrors = json.data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length > 0) {
    throw new Error(
      `metafieldsSet userErrors: ${userErrors
        .map((e) => `[${e.code}] ${e.field?.join(".") ?? ""}: ${e.message}`)
        .join("; ")}`,
    );
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
  },
): Promise<{ created: boolean }> {
  const response = await admin.graphql(CREATE_METAFIELD_DEFINITION, {
    variables: { definition },
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
  // Variant-level (one row per scale column)
  {
    name: "Size Norm — US",
    namespace: "size_norm",
    key: "us",
    type: "single_line_text_field",
    ownerType: "PRODUCTVARIANT" as const,
  },
  {
    name: "Size Norm — EU",
    namespace: "size_norm",
    key: "eu",
    type: "single_line_text_field",
    ownerType: "PRODUCTVARIANT" as const,
  },
  {
    name: "Size Norm — UK",
    namespace: "size_norm",
    key: "uk",
    type: "single_line_text_field",
    ownerType: "PRODUCTVARIANT" as const,
  },
  {
    name: "Size Norm — JP mondopoint (mm)",
    namespace: "size_norm",
    key: "jp_mm",
    type: "number_integer",
    ownerType: "PRODUCTVARIANT" as const,
  },
  {
    name: "Size Norm — Matrix (JSON)",
    namespace: "size_norm",
    key: "matrix",
    description: "Full {us, eu, uk, jpMm} object for fast PDP rendering.",
    type: "json",
    ownerType: "PRODUCTVARIANT" as const,
  },
  {
    name: "Size Norm — Source label",
    namespace: "size_norm",
    key: "source_label",
    description: "The original variant option value before normalization.",
    type: "single_line_text_field",
    ownerType: "PRODUCTVARIANT" as const,
  },
  {
    name: "Size Norm — Manual override",
    namespace: "size_norm",
    key: "manual_override",
    description: "Set to true when merchant forced the conversion values.",
    type: "boolean",
    ownerType: "PRODUCTVARIANT" as const,
  },
];

/**
 * Iterates {@link METAFIELD_DEFINITIONS} and creates each one idempotently.
 * Called from {@link ensureSeed} on first install.
 */
export async function ensureMetafieldDefinitions(admin: Admin): Promise<{
  total: number;
  created: number;
}> {
  let created = 0;
  for (const def of METAFIELD_DEFINITIONS) {
    const result = await createMetafieldDefinitionIdempotent(admin, def);
    if (result.created) created++;
  }
  return { total: METAFIELD_DEFINITIONS.length, created };
}
