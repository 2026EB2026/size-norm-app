import { unauthenticated } from "../../shopify.server";

import type { Admin } from "./client";

/**
 * Returns an admin GraphQL client for the given shop using the stored
 * offline session. Used by Inngest functions (no request context).
 *
 * Throws if there is no offline session — e.g. the app was uninstalled.
 */
export async function getAdminForBackground(shopDomain: string): Promise<Admin> {
  const { admin } = await unauthenticated.admin(shopDomain);
  return admin;
}
