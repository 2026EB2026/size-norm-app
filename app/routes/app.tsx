import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { ensureSeed } from "../lib/db/seed";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  // First-install seed: runs once per shop, then becomes a no-op. Creates
  // Shopify Metafield Definitions + inserts 28 V1 scales + 28 generic
  // conversion tables on the first visit.
  await ensureSeed(session.shop, admin);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <ui-nav-menu>
        <a href="/app" rel="home">Home</a>
        <a href="/app/alerts">Alerts</a>
        <a href="/app/scales">Scale Atelier</a>
        <a href="/app/tables">Conversion Tables</a>
        <a href="/app/bulk">Bulk</a>
        <a href="/app/settings">Settings</a>
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
