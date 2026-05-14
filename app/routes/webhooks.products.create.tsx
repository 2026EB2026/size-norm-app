import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { runProcessor } from "../lib/processor";

/**
 * Webhook handler for `products/create`. Runs the processor on the new
 * product. Idempotent: if Shopify re-delivers the webhook (which it does
 * on failures), the snapshot-hash check will short-circuit.
 *
 * Returns 200 on success; throws (→ Shopify retry) on Shopify or DB errors.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, admin, payload, topic } = await authenticate.webhook(request);
  // eslint-disable-next-line no-undef
  console.log(`Received ${topic} webhook for ${shop}`);

  // CLI-triggered webhooks have admin === undefined; we acknowledge but
  // skip processing because we can't make authenticated GraphQL calls.
  if (admin === undefined) {
    return new Response();
  }

  const payloadObj = payload as { id?: number | string } | undefined;
  const rawId = payloadObj?.id;
  if (rawId === undefined) {
    // eslint-disable-next-line no-undef
    console.warn(`products/create webhook for ${shop} missing payload.id`);
    return new Response();
  }
  const productGid = `gid://shopify/Product/${rawId}`;

  await runProcessor(admin, prisma, shop, productGid);
  return new Response();
};
