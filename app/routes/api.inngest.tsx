import { serve } from "inngest/remix";

import { inngest } from "../inngest/client";
import { inngestFunctions } from "../inngest/functions";

/**
 * HTTP endpoint for Inngest. Inngest cloud calls this URL to:
 *   - GET: sync registered functions (called on deploy)
 *   - POST: invoke a specific function step
 *   - PUT: app introspection
 *
 * The `serve` helper from `inngest/remix` returns a single handler that
 * React Router 7 uses for both loader (GET) and action (POST/PUT/DELETE).
 *
 * Production requires `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` env vars.
 * In local dev the Inngest Dev Server skips signing checks.
 */
const handler = serve({
  client: inngest,
  functions: inngestFunctions,
});

export { handler as loader, handler as action };
