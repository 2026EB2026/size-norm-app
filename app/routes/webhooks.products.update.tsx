import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { runProcessor } from "../lib/processor";

/**
 * Webhook handler for `products/update`. Same as `products/create` except the
 * snapshot-hash check is the primary defence against unnecessary reprocessing
 * — many product updates (description, image reorder, …) don't affect
 * anything the conversion engine cares about, so we short-circuit early.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, admin, payload, topic } = await authenticate.webhook(request);
  // eslint-disable-next-line no-undef
  console.log(`Received ${topic} webhook for ${shop}`);

  if (admin === undefined) {
    return new Response();
  }

  const payloadObj = payload as { id?: number | string } | undefined;
  const rawId = payloadObj?.id;
  if (rawId === undefined) {
    // eslint-disable-next-line no-undef
    console.warn(`products/update webhook for ${shop} missing payload.id`);
    return new Response();
  }
  const productGid = `gid://shopify/Product/${rawId}`;

  const result = await runProcessor(admin, prisma, shop, productGid);
  // eslint-disable-next-line no-undef
  console.log(
    `products/update result for ${productGid}: ${result.kind}${
      result.kind === "skip" ? ` (${result.reason})` : ""
    }`,
  );
  return new Response();
};
