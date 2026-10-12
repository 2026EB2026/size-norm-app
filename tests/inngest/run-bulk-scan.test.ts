import { beforeEach, describe, expect, it, vi } from "vitest";

const bulkJobUpdate = vi.fn();
const fetchProductIdPage = vi.fn();
const runProcessor = vi.fn();

vi.mock("../../app/db.server", () => ({
  default: { bulkJob: { update: bulkJobUpdate } },
}));
vi.mock("../../app/lib/shopify/offline-admin", () => ({
  getAdminForBackground: vi.fn(async () => ({})),
}));
vi.mock("../../app/lib/processor", () => ({
  runProcessor: (...args: unknown[]) => runProcessor(...args),
}));
vi.mock("../../app/lib/shopify/paginate", () => ({
  fetchProductIdPage: (...args: unknown[]) => fetchProductIdPage(...args),
}));

const {
  runBulkScan,
  PAGE_SIZE,
  MAX_PAGES_PER_RUN,
} = await import("../../app/inngest/functions/run-bulk-scan");

/** Executes steps inline and records every step id, like a real run would. */
function fakeStep() {
  const ids: string[] = [];
  return {
    ids,
    step: {
      run: async <T>(id: string, fn: () => Promise<T>): Promise<unknown> => {
        ids.push(id);
        return fn();
      },
    },
  };
}

const logger = { warn: vi.fn() };

/** A catalogue of `n` products, paged the way Shopify would page it. */
function cataloguePages(n: number) {
  fetchProductIdPage.mockImplementation(async (_admin, opts) => {
    const start = opts.after === null ? 0 : Number(opts.after);
    const ids = Array.from(
      { length: Math.max(0, Math.min(PAGE_SIZE, n - start)) },
      (_, i) => `gid://shopify/Product/${start + i}`,
    );
    const next = start + ids.length;
    return {
      ids,
      hasNextPage: next < n,
      endCursor: String(next),
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  runProcessor.mockResolvedValue({ kind: "success" });
});

describe("runBulkScan", () => {
  it("finishes a catalogue that fits in one run", async () => {
    cataloguePages(120);
    const { step, ids } = fakeStep();
    const continueWith = vi.fn();

    const r = await runBulkScan({
      step,
      logger,
      shopDomain: "s.myshopify.com",
      jobId: "job1",
      searchQuery: null,
      state: {},
      continueWith,
    });

    expect(r).toEqual({ total: 120, processed: 120, errors: 0, done: true });
    expect(continueWith).not.toHaveBeenCalled();
    expect(ids).toContain("mark-completed");
  });

  it("stays far under Inngest's 1000-step cap", async () => {
    // The bug this replaces opened one step per product, so a 950-product
    // catalogue burned 989 steps and the run died before mark-completed.
    cataloguePages(PAGE_SIZE * MAX_PAGES_PER_RUN);
    const { step, ids } = fakeStep();

    await runBulkScan({
      step,
      logger,
      shopDomain: "s.myshopify.com",
      jobId: "job1",
      searchQuery: null,
      state: {},
      continueWith: vi.fn(),
    });

    expect(ids.length).toBeLessThan(300);
  });

  it("hands over to a continuation instead of running past the cap", async () => {
    const perRun = PAGE_SIZE * MAX_PAGES_PER_RUN;
    cataloguePages(perRun + 10);
    const { step, ids } = fakeStep();
    const continueWith = vi.fn();

    const r = await runBulkScan({
      step,
      logger,
      shopDomain: "s.myshopify.com",
      jobId: "job1",
      searchQuery: null,
      state: {},
      continueWith,
    });

    expect(r.done).toBe(false);
    expect(ids).not.toContain("mark-completed");
    expect(continueWith).toHaveBeenCalledWith({
      cursor: String(perRun),
      total: perRun,
      processed: perRun,
      errors: 0,
    });
  });

  it("resumes from the carried state without double-counting", async () => {
    cataloguePages(60);
    const { step, ids } = fakeStep();

    const r = await runBulkScan({
      step,
      logger,
      shopDomain: "s.myshopify.com",
      jobId: "job1",
      searchQuery: null,
      state: { cursor: "60", total: 60, processed: 58, errors: 2 },
      continueWith: vi.fn(),
    });

    // Nothing left past cursor 60, so the run only closes the job out.
    expect(r).toEqual({ total: 60, processed: 58, errors: 2, done: true });
    // A continuation must not re-flip the row to RUNNING.
    expect(ids).not.toContain("mark-running");
  });

  it("counts a failing product as an error and keeps going", async () => {
    cataloguePages(20);
    runProcessor.mockImplementation(async (_a, _b, _c, gid: string) => {
      if (gid.endsWith("/3")) throw new Error("boom");
      return { kind: "success" };
    });
    const { step } = fakeStep();

    const r = await runBulkScan({
      step,
      logger,
      shopDomain: "s.myshopify.com",
      jobId: "job1",
      searchQuery: null,
      state: {},
      continueWith: vi.fn(),
    });

    expect(r).toEqual({ total: 20, processed: 19, errors: 1, done: true });
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
