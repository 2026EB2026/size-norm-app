import { runBulkScan, type BulkScanState } from "./run-bulk-scan";

import { inngest } from "../client";

/**
 * Re-scans the entire catalogue for one shop.
 *
 * The walk itself lives in {@link runBulkScan}; this function only wires the
 * event to it. A catalogue bigger than one run's step budget is handed to a
 * continuation run carrying the cursor and counters, so the BulkJob row shows
 * one continuous progress bar either way.
 *
 * Inngest concurrency is 1 per shop to avoid hammering Shopify's GraphQL rate
 * limit when the merchant triggers several bulk jobs in a row.
 */
export const bulkFullRescan = inngest.createFunction(
  {
    id: "bulk-full-rescan",
    name: "Bulk: full catalogue re-scan",
    concurrency: { key: "event.data.shopDomain", limit: 1 },
    retries: 3,
    triggers: [{ event: "app/bulk.full-rescan.requested" }],
  },
  async ({ event, step, logger }) => {
    const data = event.data as {
      shopDomain: string;
      jobId: string;
    } & BulkScanState;
    const { shopDomain, jobId } = data;

    return runBulkScan({
      step,
      logger,
      shopDomain,
      jobId,
      // No filter: the processor skips products that aren't footwear.
      searchQuery: null,
      state: data,
      continueWith: async (next) => {
        await inngest.send({
          name: "app/bulk.full-rescan.requested",
          data: { shopDomain, jobId, ...next },
        });
      },
    });
  },
);
