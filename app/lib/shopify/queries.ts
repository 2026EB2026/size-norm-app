/**
 * Centralized GraphQL query/mutation strings used by the processor and
 * metafield-definition bootstrap. Kept as `#graphql` template literals so the
 * graphql-codegen + Shopify GraphQL linting pick them up.
 */

export const GET_PRODUCT_FOR_PROCESSING = `#graphql
  query GetProductForProcessing($id: ID!) {
    product(id: $id) {
      id
      title
      vendor
      productType
      status
      tags
      gender: metafield(namespace: "size_norm", key: "gender") {
        value
      }
      scaleSigla: metafield(namespace: "size_norm", key: "scale_sigla") {
        value
      }
      ageCategory: metafield(namespace: "size_norm", key: "age_category") {
        value
      }
      variants(first: 100) {
        nodes {
          id
          title
          selectedOptions {
            name
            value
          }
        }
      }
    }
  }
` as const;

/**
 * Diagnostics-only query: reads the *current* `size_norm` metafield state
 * written by previous runs, so the admin can distinguish "conversion never
 * ran / failed" from "conversion is fine but the theme block is missing or
 * misplaced on the product template".
 */
export const GET_PRODUCT_DIAGNOSTICS = `#graphql
  query GetProductDiagnostics($id: ID!) {
    product(id: $id) {
      id
      status
      conversionStatus: metafield(namespace: "size_norm", key: "conversion_status") {
        value
      }
      lastProcessedAt: metafield(namespace: "size_norm", key: "last_processed_at") {
        value
      }
      displayScale: metafield(namespace: "size_norm", key: "display_scale") {
        value
      }
      variants(first: 100) {
        nodes {
          id
          matrix: metafield(namespace: "size_norm", key: "matrix") {
            value
          }
        }
      }
    }
  }
` as const;

/**
 * Sets multiple metafields in a single call. We use this for both product-
 * and variant-level metafields by including the right `ownerId` per item.
 */
export const SET_METAFIELDS = `#graphql
  mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
        ownerType
      }
      userErrors {
        field
        message
        code
      }
    }
  }
` as const;

/**
 * Updates a product's status (ACTIVE / DRAFT / ARCHIVED) and/or tags.
 */
export const UPDATE_PRODUCT = `#graphql
  mutation UpdateProduct($input: ProductInput!) {
    productUpdate(input: $input) {
      product {
        id
        status
        tags
      }
      userErrors {
        field
        message
      }
    }
  }
` as const;

/**
 * Creates a Metafield Definition. Called once per definition on first install.
 * Returns userErrors with code `TAKEN` when the definition already exists,
 * which we treat as success (idempotent).
 */
export const CREATE_METAFIELD_DEFINITION = `#graphql
  mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition {
        id
        namespace
        key
      }
      userErrors {
        field
        message
        code
      }
    }
  }
` as const;

/**
 * Reads the storefront access of the app's own definitions for one owner type.
 * Used to repair installs created before storefront access was requested: a
 * definition with `storefront: NONE` is invisible to Liquid, so the PDP block
 * renders its empty state on the live storefront no matter what the processor
 * wrote.
 */
export const GET_METAFIELD_DEFINITION_ACCESS = `#graphql
  query GetMetafieldDefinitionAccess(
    $ownerType: MetafieldOwnerType!
    $namespace: String!
  ) {
    metafieldDefinitions(first: 50, ownerType: $ownerType, namespace: $namespace) {
      nodes {
        key
        access {
          storefront
        }
      }
    }
  }
` as const;

/**
 * Grants (or revokes) Storefront API / Liquid read access on an existing
 * definition. Identified by namespace + key + ownerType, so it is safe to
 * re-run.
 */
export const UPDATE_METAFIELD_DEFINITION_ACCESS = `#graphql
  mutation UpdateMetafieldDefinitionAccess(
    $definition: MetafieldDefinitionUpdateInput!
  ) {
    metafieldDefinitionUpdate(definition: $definition) {
      updatedDefinition {
        id
        key
      }
      userErrors {
        field
        message
        code
      }
    }
  }
` as const;

/**
 * Deletes metafields by owner + namespace + key. Shopify rejects a blank
 * value on a typed metafield (`[INVALID_VALUE] Value can't be blank`), so
 * clearing one requires this mutation rather than writing "".
 */
export const DELETE_METAFIELDS = `#graphql
  mutation DeleteMetafields($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      deletedMetafields {
        key
      }
      userErrors {
        field
        message
      }
    }
  }
` as const;
