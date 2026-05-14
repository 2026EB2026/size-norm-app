import { Inngest } from "inngest";

/**
 * Inngest event payload shapes. Used for type-safe `inngest.send(...)` calls.
 *
 * Note: Inngest 4.x no longer ships its own `EventSchemas` builder; the
 * preferred approach is to pass these shapes through `inngest.send` callers
 * as runtime data, or to type them at the call site. We keep this map
 * exported so the admin route can import payload types when needed.
 */
export interface BulkFullRescanEvent {
  name: "app/bulk.full-rescan.requested";
  data: {
    shopDomain: string;
    jobId: string;
  };
}

export interface BulkReconvertByScaleEvent {
  name: "app/bulk.reconvert-by-scale.requested";
  data: {
    shopDomain: string;
    jobId: string;
    scaleSigla: string;
  };
}

export interface BulkReconvertByBrandEvent {
  name: "app/bulk.reconvert-by-brand.requested";
  data: {
    shopDomain: string;
    jobId: string;
    brand: string;
  };
}

export type AppEvent =
  | BulkFullRescanEvent
  | BulkReconvertByScaleEvent
  | BulkReconvertByBrandEvent;

export const inngest = new Inngest({
  id: "size-norm-app",
  // eventKey is read from INNGEST_EVENT_KEY env var automatically.
  // signingKey is read from INNGEST_SIGNING_KEY by `serve(...)`.
});
