import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const filterSigla = url.searchParams.get("sigla")?.trim() ?? "";
  const filterBrand = url.searchParams.get("brand")?.trim() ?? "";
  const filterState = url.searchParams.get("state")?.trim() ?? "";

  const where: Record<string, unknown> = { shopDomain: session.shop };
  if (filterSigla.length > 0) {
    where.scaleSigla = { contains: filterSigla, mode: "insensitive" };
  }
  if (filterBrand.length > 0) {
    where.brand = { contains: filterBrand, mode: "insensitive" };
  }
  if (filterState === "seed") where.isSeed = true;
  if (filterState === "validated") where.isSeed = false;

  const [tables, totalCount, seedCount] = await Promise.all([
    prisma.conversionTable.findMany({
      where,
      orderBy: [{ scaleSigla: "asc" }, { brand: "asc" }],
      take: 300,
    }),
    prisma.conversionTable.count({ where: { shopDomain: session.shop } }),
    prisma.conversionTable.count({
      where: { shopDomain: session.shop, isSeed: true },
    }),
  ]);

  return {
    filterSigla,
    filterBrand,
    filterState,
    counts: {
      total: totalCount,
      seed: seedCount,
      validated: totalCount - seedCount,
    },
    tables: tables.map((t) => ({
      id: t.id,
      scaleSigla: t.scaleSigla,
      brand: t.brand,
      isSeed: t.isSeed,
      mappingsCount: Array.isArray(t.mappings) ? t.mappings.length : 0,
    })),
  };
};

export default function TablesIndex() {
  const { tables, counts, filterSigla, filterBrand, filterState } =
    useLoaderData<typeof loader>();
  const filtersActive =
    filterSigla.length > 0 || filterBrand.length > 0 || filterState.length > 0;

  return (
    <s-page heading="Conversion Tables">
      <s-button slot="primary-action" href="/app/tables/new" variant="primary">
        Nuova tabella
      </s-button>

      <s-section heading="Catalogo tabelle">
        <s-stack direction="inline" gap="small">
          <s-badge tone="neutral">{`${counts.total} totali`}</s-badge>
          <s-badge tone="info">{`${counts.seed} seed da validare`}</s-badge>
          <s-badge tone="success">{`${counts.validated} validate`}</s-badge>
        </s-stack>
        <s-paragraph color="subdued">
          Ogni tabella mappa le etichette di una scala alla matrice
          US/EU/UK/CM/JP. Le tabelle <s-text type="strong">seed</s-text> sono
          fornite dall&apos;app e si aggiornano automaticamente; salvando una
          modifica diventano <s-text type="strong">validate</s-text> e di tua
          proprietà.
        </s-paragraph>

        <form method="get">
          <s-stack direction="inline" gap="base">
            <s-text-field
              name="sigla"
              label="Sigla scala"
              placeholder="es. asics"
              defaultValue={filterSigla}
            />
            <s-text-field
              name="brand"
              label="Brand"
              defaultValue={filterBrand}
            />
            <s-select name="state" label="Stato" value={filterState}>
              <s-option value="">Tutte</s-option>
              <s-option value="seed">Seed</s-option>
              <s-option value="validated">Validate</s-option>
            </s-select>
            <s-button type="submit">Filtra</s-button>
            {filtersActive && (
              <s-button href="/app/tables" variant="tertiary">
                Reset
              </s-button>
            )}
          </s-stack>
        </form>
      </s-section>

      <s-section heading={`${tables.length} tabelle`}>
        {tables.length === 0 ? (
          <s-stack direction="block" gap="base">
            <s-paragraph color="subdued">
              Nessuna tabella corrisponde ai filtri.
            </s-paragraph>
            {filtersActive && (
              <s-button href="/app/tables" variant="secondary">
                Mostra tutte
              </s-button>
            )}
          </s-stack>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Sigla scala</s-table-header>
              <s-table-header>Brand</s-table-header>
              <s-table-header>Stato</s-table-header>
              <s-table-header>Mappings</s-table-header>
              <s-table-header>Azioni</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {tables.map((t) => (
                <s-table-row key={t.id}>
                  <s-table-cell>
                    <s-text type="strong">{t.scaleSigla}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    {t.brand === null ? (
                      <s-text color="subdued">Generic</s-text>
                    ) : (
                      t.brand
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    {t.isSeed ? (
                      <s-badge tone="info">Seed</s-badge>
                    ) : (
                      <s-badge tone="success">Validata</s-badge>
                    )}
                  </s-table-cell>
                  <s-table-cell>{t.mappingsCount}</s-table-cell>
                  <s-table-cell>
                    <Link to={`/app/tables/${t.id}`}>Modifica</Link>
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
