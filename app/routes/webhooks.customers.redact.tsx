import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

/**
 * Mandatory GDPR/CCPA compliance webhook: `customers/redact`.
 *
 * Fired when a store owner asks that a shopper's personal data be deleted.
 * We must acknowledge with a 2xx and complete the deletion within 30 days.
 *
 * Size Norm holds no shopper personal data — see the note in
 * `webhooks.customers.data_request.tsx` for why — so there is nothing to
 * redact. We log the request for auditability and acknowledge.
 *
 * Kept as a distinct route (rather than sharing one endpoint with the other
 * compliance topics) so that the day this app does touch customer data, the
 * deletion logic has an obvious home and can't be bolted onto the wrong
 * topic by mistake.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  const body = payload as
    | { customer?: { id?: number | string }; orders_to_redact?: unknown[] }
    | undefined;

  // eslint-disable-next-line no-undef, no-console
  console.log(
    `[compliance] ${topic} for ${shop} — customer ${String(
      body?.customer?.id ?? "n/a",
    )}, orders ${
      body?.orders_to_redact?.length ?? 0
    }: no shopper data stored by this app, nothing to redact.`,
  );

  return new Response();
};
