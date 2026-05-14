import { bulkFullRescan } from "./bulk-full-rescan";
import { bulkReconvertByBrand } from "./bulk-reconvert-by-brand";
import { bulkReconvertByScale } from "./bulk-reconvert-by-scale";

/**
 * All Inngest functions registered with the HTTP handler. Adding a new
 * function: import it here and append to the array. The handler at
 * `/api/inngest` auto-syncs the function list with Inngest cloud on
 * deployment.
 */
export const inngestFunctions = [
  bulkFullRescan,
  bulkReconvertByScale,
  bulkReconvertByBrand,
];
