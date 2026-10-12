import { buildBulkSearchQuery } from "../../lib/shopify/paginate";

import { runBulkScan, type BulkScanState } from "./run-bulk-scan";
import { inngest } from "../client";

/**
 * Re-runs the processor only on products whose `size_norm.scale_sigla`
 * metafield matches the given sigla. The walk lives in {@link runBulkScan}.
 */
export const bulkReconvertByScale = inngest.createFunction(
  {
    id: "bulk-reconvert-by-scale",
    name: "Bulk: reconvert by scale sigla",
    concurrency: { key: "event.data.shopDomain", limit: 1 },
    retries: 3,
    triggers: [{ event: "app/bulk.reconvert-by-scale.requested" }],
  },
  async ({ event, step, logger }) => {
    const data = event.data as {
      shopDomain: string;
      jobId: string;
      scaleSigla: string;
    } & BulkScanState;
    const { shopDomain, jobId, scaleSigla } = data;

    return runBulkScan({
      step,
      logger,
      shopDomain,
      jobId,
      searchQuery: buildBulkSearchQuery({ scaleSigla }),
      state: data,
      continueWith: async (next) => {
        await inngest.send({
          name: "app/bulk.reconvert-by-scale.requested",
          data: { shopDomain, jobId, scaleSigla, ...next },
        });
      },
    });
  },
);
