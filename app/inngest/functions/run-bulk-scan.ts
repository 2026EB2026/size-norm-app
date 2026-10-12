import {
  fetchProductIdPage,
  type ProductIdPage,
} from "../../lib/shopify/paginate";
import { getAdminForBackground } from "../../lib/shopify/offline-admin";
import { runProcessor } from "../../lib/processor";
import prisma from "../../db.server";

/** Products fetched per Shopify GraphQL page. */
export const PAGE_SIZE = 50;

/**
 * Products handled inside ONE Inngest step.
 *
 * The original code opened a step per product. Inngest caps a run at 1000
 * steps, so a full re-scan died at 989 — 950 products, 19 page fetches, 19
 * progress writes and the mark-running — and the retries replayed into the
 * same wall. This shop has over 10,000 products.
 *
 * Ten keeps each step well inside the serverless request budget (a product is
 * a read plus a metafield write) while cutting the step count by 10x. Raising
 * it trades retry granularity for fewer round trips: when a step fails, every
 * product in its batch is processed again. That is safe — runProcessor is
 * idempotent — but it is wasted work.
 */
export const BATCH_SIZE = 10;

/**
 * Pages one run handles before handing over to a fresh run.
 *
 * 20 pages = 1000 products = about 142 steps, comfortably under the cap with
 * room for retries. Batching alone would not be enough: at 10,000 products a
 * single run would still need ~1200 steps.
 */
export const MAX_PAGES_PER_RUN = 20;

/** Counters carried across the runs of one logical job. */
export interface BulkScanState {
  cursor?: string | null;
  total?: number;
  processed?: number;
  errors?: number;
}

/**
 * The slice of Inngest's step API this helper needs.
 *
 * `step.run` returns the value as it comes back out of JSON, not as the
 * callback typed it, so results are widened to `unknown` here and asserted at
 * the call site. The shapes crossing that boundary are plain JSON — string
 * arrays, booleans, numbers — so the assertions hold.
 */
type StepLike = {
  run: <T>(id: string, fn: () => Promise<T>) => Promise<unknown>;
};
type LoggerLike = { warn: (msg: string, meta?: unknown) => void };

export interface BulkScanResult {
  total: number;
  processed: number;
  errors: number;
  /** False when the job handed over to a continuation run. */
  done: boolean;
}

/**
 * Walks a shop's catalogue (optionally filtered by `searchQuery`), runs the
 * processor over every product and keeps the BulkJob row up to date.
 *
 * Shared by all three bulk jobs — they differ only in which products they
 * select, so they used to be three copies of the same loop, and the same bug.
 *
 * When the catalogue outlasts one run's step budget, the function calls
 * `continueWith` and returns `done: false`. The BulkJob row stays RUNNING and
 * the continuation picks up from the cursor with the counters intact, so the
 * admin UI shows one continuous progress bar.
 */
export async function runBulkScan(opts: {
  step: StepLike;
  logger: LoggerLike;
  shopDomain: string;
  jobId: string;
  searchQuery: string | null;
  state: BulkScanState;
  continueWith: (next: Required<BulkScanState>) => Promise<void>;
}): Promise<BulkScanResult> {
  const { step, logger, shopDomain, jobId, searchQuery, state } = opts;

  let cursor: string | null = state.cursor ?? null;
  let total = state.total ?? 0;
  let processed = state.processed ?? 0;
  let errors = state.errors ?? 0;

  // Only the first run of a job flips the row to RUNNING; a continuation
  // would otherwise clear nothing but still cost a step.
  if (cursor === null) {
    await step.run("mark-running", async () => {
      await prisma.bulkJob.update({
        where: { id: jobId },
        data: { status: "RUNNING" },
      });
    });
  }

  let pageNumber = 0;
  let hasMore = true;

  while (hasMore && pageNumber < MAX_PAGES_PER_RUN) {
    pageNumber++;
    const currentCursor: string | null = cursor;
    const page = (await step.run(
      `fetch-page-${pageNumber}`,
      async (): Promise<ProductIdPage> => {
        const admin = await getAdminForBackground(shopDomain);
        return fetchProductIdPage(admin, {
          after: currentCursor,
          first: PAGE_SIZE,
          query: searchQuery,
        });
      },
    )) as ProductIdPage;
    total += page.ids.length;

    for (let i = 0; i < page.ids.length; i += BATCH_SIZE) {
      const batch = page.ids.slice(i, i + BATCH_SIZE);
      const counts = (await step.run(
        `process-page-${pageNumber}-batch-${i / BATCH_SIZE}`,
        async () => {
          // One admin client for the whole batch: it used to be re-created
          // for every single product.
          const admin = await getAdminForBackground(shopDomain);
          let ok = 0;
          let failed = 0;
          for (const productGid of batch) {
            try {
              await runProcessor(admin, prisma, shopDomain, productGid, {
                force: true,
              });
              ok++;
            } catch (e) {
              logger.warn(`processor failed for ${productGid}`, {
                error: e instanceof Error ? e.message : String(e),
              });
              failed++;
            }
          }
          return { ok, failed };
        },
      )) as { ok: number; failed: number };
      processed += counts.ok;
      errors += counts.failed;
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

  if (hasMore) {
    await step.run("continue-next-run", async () => {
      await opts.continueWith({ cursor, total, processed, errors });
    });
    return { total, processed, errors, done: false };
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

  return { total, processed, errors, done: true };
}
