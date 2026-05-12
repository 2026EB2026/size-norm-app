import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const scales = await prisma.sizeScale.findMany({
    where: { shopDomain: session.shop },
    orderBy: [{ gender: "asc" }, { sigla: "asc" }],
  });
  return {
    scales: scales.map((s) => ({
      id: s.id,
      sigla: s.sigla,
      name: s.name,
      gender: s.gender,
      sourceScale: s.sourceScale,
      labelsCount: Array.isArray(s.labels) ? s.labels.length : 0,
    })),
  };
};

const GENDER_LABEL: Record<string, string> = {
  MEN: "Uomo",
  WOMEN: "Donna",
  UNISEX: "Unisex",
  KID: "Bambino",
};

const SOURCE_SCALE_LABEL: Record<string, string> = {
  US: "US",
  EU: "EU",
  UK: "UK",
  JP_MM: "JP-mm",
  DOUBLE: "Double sizing",
  MW_COMBINED: "M/W combinato",
};

export default function ScalesIndex() {
  const { scales } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Scale Atelier">
      <s-button slot="primary-action" href="/app/scales/new">
        Nuova scala
      </s-button>

      <s-section heading={`${scales.length} scale configurate`}>
        <s-paragraph>
          Le scale Atelier sono i sistemi di etichettatura che il merchant usa internamente
          (es. <s-text>#G</s-text> per Scarpe Uomo IT). Modifica labels e aliases di una scala
          per cambiare cosa l&apos;app riconosce come input valido per quei prodotti.
        </s-paragraph>

        {scales.length === 0 ? (
          <s-paragraph>
            Nessuna scala configurata. La prima installazione dovrebbe averne
            caricato 28. Se vedi questo messaggio, contatta il dev.
          </s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Sigla</s-table-header>
              <s-table-header>Nome</s-table-header>
              <s-table-header>Genere</s-table-header>
              <s-table-header>Scala base</s-table-header>
              <s-table-header>N° etichette</s-table-header>
              <s-table-header>Azioni</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {scales.map((s) => (
                <s-table-row key={s.id}>
                  <s-table-cell>
                    <s-text>{s.sigla}</s-text>
                  </s-table-cell>
                  <s-table-cell>{s.name}</s-table-cell>
                  <s-table-cell>{GENDER_LABEL[s.gender] ?? s.gender}</s-table-cell>
                  <s-table-cell>
                    {SOURCE_SCALE_LABEL[s.sourceScale] ?? s.sourceScale}
                  </s-table-cell>
                  <s-table-cell>{s.labelsCount}</s-table-cell>
                  <s-table-cell>
                    <Link to={`/app/scales/${encodeURIComponent(s.sigla)}`}>
                      Modifica
                    </Link>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
