import type { Admin } from "./client";

/**
 * Lists product IDs from the Admin GraphQL API, page by page. Used by the
 * bulk re-scan and reconvert-by-X Inngest functions.
 *
 * The `query` parameter is the Shopify search syntax (e.g. `vendor:Gucci`).
 * Pass `null` for an unfiltered scan of the entire catalog.
 */
export const LIST_PRODUCT_IDS = `#graphql
  query ListProductIds($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      nodes {
        id
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
` as const;

export interface ProductIdPage {
  ids: string[];
  hasNextPage: boolean;
  endCursor: string | null;
}

/**
 * Single page of product IDs. Default page size is 50 (Shopify's max for
 * unfiltered queries is 250, but smaller pages keep Inngest steps light and
 * GraphQL cost within rate limits).
 */
export async function fetchProductIdPage(
  admin: Admin,
  options: {
    after?: string | null;
    query?: string | null;
    first?: number;
  } = {},
): Promise<ProductIdPage> {
  const { after = null, query = null, first = 50 } = options;
  const response = await admin.graphql(LIST_PRODUCT_IDS, {
    variables: { first, after, query },
  });
  const json = (await response.json()) as {
    data?: {
      products?: {
        nodes: { id: string }[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    };
    errors?: { message: string }[];
  };
  if (json.errors !== undefined && json.errors.length > 0) {
    throw new Error(
      `GraphQL errors listing product IDs: ${json.errors
        .map((e) => e.message)
        .join("; ")}`,
    );
  }
  const data = json.data?.products;
  if (data === undefined) {
    throw new Error("Malformed response from products query");
  }
  return {
    ids: data.nodes.map((n) => n.id),
    hasNextPage: data.pageInfo.hasNextPage,
    endCursor: data.pageInfo.endCursor,
  };
}

/**
 * Helper that builds the Shopify search-query string for the three bulk
 * job types. Returns `null` for FULL_RESCAN (no filter — processor will
 * skip non-footwear).
 */
export function buildBulkSearchQuery(filter: {
  scaleSigla?: string | null;
  brand?: string | null;
}): string | null {
  const parts: string[] = [];
  if (filter.brand !== null && filter.brand !== undefined && filter.brand.length > 0) {
    // Quote the brand to handle multi-word vendors like "Saint Laurent".
    parts.push(`vendor:"${escapeQuotes(filter.brand)}"`);
  }
  if (filter.scaleSigla !== null && filter.scaleSigla !== undefined && filter.scaleSigla.length > 0) {
    // Shopify metafield filter syntax. The sigla may contain `#` which is
    // not special in the search syntax; quoting protects against issues.
    parts.push(`metafields.size_norm.scale_sigla:"${escapeQuotes(filter.scaleSigla)}"`);
  }
  return parts.length === 0 ? null : parts.join(" AND ");
}

function escapeQuotes(s: string): string {
  return s.replace(/"/g, '\\"');
}
