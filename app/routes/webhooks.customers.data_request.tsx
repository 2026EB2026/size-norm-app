import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

/**
 * Mandatory GDPR/CCPA compliance webhook: `customers/data_request`.
 *
 * Fired when a shopper asks a store owner for the personal data an app holds
 * about them. We must acknowledge with a 2xx and, within 30 days, hand any
 * such data to the store owner.
 *
 * Size Norm stores **no shopper personal data**. Everything we persist is
 * shop-scoped catalogue configuration — size scales, conversion tables,
 * per-product processing snapshots, conversion alerts and bulk-job records.
 * None of it is keyed to, derived from, or joinable with a customer, an
 * order, or an email address; the app never requests customer or order
 * scopes (see `scopes` in shopify.app.toml: product scopes only).
 *
 * So there is nothing to disclose: we log the request for auditability and
 * acknowledge. If customer-linked data is ever introduced, this handler must
 * be updated to collect and forward it.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  const body = payload as
    | {
        customer?: { id?: number | string };
        data_request?: { id?: number | string };
        orders_requested?: unknown[];
      }
    | undefined;

  // eslint-disable-next-line no-undef, no-console
  console.log(
    `[compliance] ${topic} for ${shop} — request ${String(
      body?.data_request?.id ?? "n/a",
    )}, customer ${String(body?.customer?.id ?? "n/a")}, orders ${
      body?.orders_requested?.length ?? 0
    }: no shopper data stored by this app, nothing to disclose.`,
  );

  return new Response();
};
