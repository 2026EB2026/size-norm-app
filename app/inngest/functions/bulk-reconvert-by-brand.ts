import { buildBulkSearchQuery } from "../../lib/shopify/paginate";

import { runBulkScan, type BulkScanState } from "./run-bulk-scan";
import { inngest } from "../client";

/**
 * Re-runs the processor only on products with the given `vendor`. The walk
 * lives in {@link runBulkScan}.
 */
export const bulkReconvertByBrand = inngest.createFunction(
  {
    id: "bulk-reconvert-by-brand",
    name: "Bulk: reconvert by brand",
    concurrency: { key: "event.data.shopDomain", limit: 1 },
    retries: 3,
    triggers: [{ event: "app/bulk.reconvert-by-brand.requested" }],
  },
  async ({ event, step, logger }) => {
    const data = event.data as {
      shopDomain: string;
      jobId: string;
      brand: string;
    } & BulkScanState;
    const { shopDomain, jobId, brand } = data;

    return runBulkScan({
      step,
      logger,
      shopDomain,
      jobId,
      searchQuery: buildBulkSearchQuery({ brand }),
      state: data,
      continueWith: async (next) => {
        await inngest.send({
          name: "app/bulk.reconvert-by-brand.requested",
          data: { shopDomain, jobId, brand, ...next },
        });
      },
    });
  },
);
