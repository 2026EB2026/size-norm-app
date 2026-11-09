import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { ensureSeed } from "../lib/db/seed";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  // First-install seed: runs once per shop, then becomes a no-op. Creates
  // Shopify Metafield Definitions and inserts the Atelier scales plus
  // their generic conversion tables on the first visit.
  //
  // Guarded, because this is the parent route of every admin page: an
  // unreachable database used to take the whole app down with a bare
  // "Application Error" and no message, which tells the merchant nothing
  // and hides which of the two is broken. Seeding is a background concern
  // and retries on the next request, so a failure here is logged and the
  // admin still renders; pages that genuinely need the database will fail
  // on their own terms, where the error says what it is.
  try {
    await ensureSeed(session.shop, admin);
  } catch (e) {
    // eslint-disable-next-line no-undef, no-console
    console.error(
      `[size-norm] ensureSeed failed for ${session.shop}:`,
      e instanceof Error ? (e.stack ?? e.message) : e,
    );
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <ui-nav-menu>
        <a href="/app" rel="home">Home</a>
        <a href="/app/alerts">Alert</a>
        <a href="/app/diagnose">Diagnostica</a>
        <a href="/app/scales">Scale Taglie</a>
        <a href="/app/tables">Conversion Tables</a>
        <a href="/app/bulk">Bulk re-scan</a>
        <a href="/app/settings">Impostazioni</a>
      </ui-nav-menu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
