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

  const where: Record<string, unknown> = { shopDomain: session.shop };
  if (filterSigla.length > 0) where.scaleSigla = filterSigla;
  if (filterBrand.length > 0) {
    where.brand = { contains: filterBrand, mode: "insensitive" };
  }

  const tables = await prisma.conversionTable.findMany({
    where,
    orderBy: [{ scaleSigla: "asc" }, { brand: "asc" }],
  });

  return {
    filterSigla,
    filterBrand,
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
  const { tables, filterSigla, filterBrand } = useLoaderData<typeof loader>();
  const filtersActive = filterSigla.length > 0 || filterBrand.length > 0;

  return (
    <s-page heading="Conversion Tables">
      <s-button slot="primary-action" href="/app/tables/new">
        Nuova tabella
      </s-button>

      <s-section heading="Filtra">
        <form method="get">
          <s-stack direction="inline" gap="base">
            <s-text-field
              name="sigla"
              label="Sigla scala"
              defaultValue={filterSigla}
            />
            <s-text-field
              name="brand"
              label="Brand"
              defaultValue={filterBrand}
            />
            <s-button type="submit">Applica filtri</s-button>
            {filtersActive && (
              <s-button href="/app/tables" variant="tertiary">
                Reset filtri
              </s-button>
            )}
          </s-stack>
        </form>
      </s-section>

      <s-section heading={`${tables.length} tabelle`}>
        {tables.length === 0 ? (
          <s-paragraph>Nessuna tabella che corrisponda ai filtri.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Sigla scala</s-table-header>
              <s-table-header>Brand</s-table-header>
              <s-table-header>Tipo</s-table-header>
              <s-table-header>N° mappings</s-table-header>
              <s-table-header>Azioni</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {tables.map((t) => (
                <s-table-row key={t.id}>
                  <s-table-cell>
                    <s-text>{t.scaleSigla}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    {t.brand === null ? <s-text>Generic</s-text> : t.brand}
                  </s-table-cell>
                  <s-table-cell>
                    {t.isSeed ? (
                      <s-badge tone="info">Seed (da validare)</s-badge>
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
