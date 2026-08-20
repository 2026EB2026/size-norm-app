import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * Mandatory GDPR/CCPA compliance webhook: `shop/redact`.
 *
 * Shopify sends this 48 hours after a shop uninstalls the app. Unlike the
 * two customer topics, this one has real work to do: every trace of the shop
 * must be erased.
 *
 * We delete:
 *   - the `Shop` row, which cascades (ON DELETE CASCADE, see the migrations)
 *     to SizeScale, ConversionTable, ConversionAlert, ProductSnapshot and
 *     BulkJob;
 *   - the shop's `Session` rows, which are not FK-linked to Shop and which
 *     hold the access token plus, for online sessions, staff first/last name
 *     and email — the only personal data this app ever stores.
 *
 * Idempotent: the webhook can be re-delivered, and it may arrive for a shop
 * whose rows are already gone (the `app/uninstalled` handler removes
 * sessions earlier). `deleteMany` is used throughout so a missing row is a
 * no-op rather than an exception, which keeps us returning 2xx and stops
 * Shopify retrying forever.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  const [sessions, shops] = await prisma.$transaction([
    prisma.session.deleteMany({ where: { shop } }),
    prisma.shop.deleteMany({ where: { shopDomain: shop } }),
  ]);

  // eslint-disable-next-line no-undef, no-console
  console.log(
    `[compliance] ${topic} for ${shop} — deleted ${shops.count} shop row(s) (cascading scales, tables, alerts, snapshots, jobs) and ${sessions.count} session(s).`,
  );

  return new Response();
};
