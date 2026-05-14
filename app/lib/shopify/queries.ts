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
