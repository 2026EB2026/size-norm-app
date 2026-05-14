import {
  fetchProductIdPage,
  type ProductIdPage,
} from "../../lib/shopify/paginate";
import { getAdminForBackground } from "../../lib/shopify/offline-admin";
import { runProcessor } from "../../lib/processor";
import prisma from "../../db.server";

import { inngest } from "../client";

const PAGE_SIZE = 50;

/**
 * Re-scans the entire catalogue for one shop. Each step is retryable and the
 * BulkJob row is updated after every page so the admin UI can show live
 * progress.
 *
 * Inngest concurrency is set to 1 per shop to avoid hammering Shopify's
 * GraphQL rate limit when the merchant accidentally triggers multiple bulk
 * jobs in a row.
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
    const data = event.data as { shopDomain: string; jobId: string };
    const { shopDomain, jobId } = data;

    await step.run("mark-running", async () => {
      await prisma.bulkJob.update({
        where: { id: jobId },
        data: { status: "RUNNING" },
      });
    });

    let cursor: string | null = null;
    let pageNumber = 0;
    let total = 0;
    let processed = 0;
    let errors = 0;
    let hasMore = true;

    while (hasMore) {
      pageNumber++;
      const currentCursor: string | null = cursor;
      const page: ProductIdPage = await step.run(
        `fetch-page-${pageNumber}`,
        async (): Promise<ProductIdPage> => {
          const admin = await getAdminForBackground(shopDomain);
          return fetchProductIdPage(admin, {
            after: currentCursor,
            first: PAGE_SIZE,
          });
        },
      );
      total += page.ids.length;

      for (const productGid of page.ids) {
        const result = await step.run(
          `process-${productGid}`,
          async () => {
            try {
              const admin = await getAdminForBackground(shopDomain);
              const r = await runProcessor(
                admin,
                prisma,
                shopDomain,
                productGid,
                { force: true },
              );
              return { ok: true as const, kind: r.kind };
            } catch (e) {
              logger.warn(`processor failed for ${productGid}`, {
                error: e instanceof Error ? e.message : String(e),
              });
              return {
                ok: false as const,
                error: e instanceof Error ? e.message : String(e),
              };
            }
          },
        );
        if (result.ok) {
          processed++;
        } else {
          errors++;
        }
      }

      await step.run(`update-progress-page-${pageNumber}`, async () => {
        await prisma.bulkJob.update({
          where: { id: jobId },
          data: { total, processed, errors },
        });
      });

      hasMore = page.hasNextPage;
      cursor = hasMore ? page.endCursor : null;
    }

    await step.run("mark-completed", async () => {
      await prisma.bulkJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          finishedAt: new Date(),
          total,
          processed,
          errors,
        },
      });
    });

    return { total, processed, errors };
  },
);
