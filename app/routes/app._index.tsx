import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { shopDomain: session.shop };
};

export default function Index() {
  const { shopDomain } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Size Norm">
      <s-section heading="App connessa">
        <s-paragraph>
          Connessa allo store <s-text>{shopDomain}</s-text>.
        </s-paragraph>
        <s-paragraph>
          Le funzionalità di gestione scale Atelier, conversion table, processing varianti e
          rendering PDP saranno disponibili nelle milestone successive.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Stato sviluppo">
        <s-unordered-list>
          <s-list-item>Milestone 1: scaffolding e auth</s-list-item>
          <s-list-item>Milestone 2: conversion engine</s-list-item>
          <s-list-item>Milestone 3: UI gestione scale</s-list-item>
          <s-list-item>Milestone 4: webhook processing</s-list-item>
          <s-list-item>Milestone 5: bulk re-scan</s-list-item>
          <s-list-item>Milestone 6: Theme App Extension PDP</s-list-item>
          <s-list-item>Milestone 7: deploy production</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
