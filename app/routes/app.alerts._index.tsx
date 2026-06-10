import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const onlyUnresolved = url.searchParams.get("resolved") !== "1";
  const filterCode = url.searchParams.get("code")?.trim() ?? "";

  const where: Record<string, unknown> = { shopDomain: session.shop };
  if (onlyUnresolved) where.resolvedAt = null;
  if (filterCode.length > 0) where.errorCode = filterCode;

  const alerts = await prisma.conversionAlert.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Compute summary counts by errorCode (over all unresolved alerts).
  const summary = await prisma.conversionAlert.groupBy({
    by: ["errorCode"],
    where: { shopDomain: session.shop, resolvedAt: null },
    _count: { _all: true },
  });

  return {
    onlyUnresolved,
    filterCode,
    summary: summary
      .map((s) => ({ code: s.errorCode, count: s._count._all }))
      .sort((a, b) => b.count - a.count),
    alerts: alerts.map((a) => ({
      id: a.id,
      productId: a.productId,
      variantId: a.variantId,
      errorCode: a.errorCode,
      errorMessage: a.errorMessage,
      createdAt: a.createdAt.toISOString(),
      resolvedAt: a.resolvedAt?.toISOString() ?? null,
    })),
  };
};

const ERROR_CODE_LABEL: Record<string, string> = {
  MISSING_METAFIELD: "Metafield mancante",
  GENDER_MISMATCH: "Gender mismatch",
  LABEL_NOT_RECOGNIZED: "Etichetta non riconosciuta",
  TABLE_NOT_FOUND: "Tabella/scala non trovata",
  MAPPING_NOT_FOUND: "Mapping mancante",
  SCALE_OUT_OF_SCOPE_V1: "Scala fuori scope V1",
};

export default function AlertsIndex() {
  const { alerts, summary, onlyUnresolved, filterCode } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Alerts di conversione">
      <s-section heading="Sommario non risolti">
        {summary.length === 0 ? (
          <s-banner tone="success" heading="Tutto in ordine">
            <s-text>
              Nessun alert aperto: tutte le conversioni sono andate a buon
              fine.
            </s-text>
          </s-banner>
        ) : (
          <s-stack direction="inline" gap="small">
            {summary.map((s) => (
              <s-badge key={s.code} tone="critical">
                {`${ERROR_CODE_LABEL[s.code] ?? s.code} · ${s.count}`}
              </s-badge>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section heading="Filtra">
        <form method="get">
          <s-stack direction="inline" gap="base">
            <s-text-field
              name="code"
              label="Filter per errorCode"
              defaultValue={filterCode}
            />
            <s-select
              name="resolved"
              label="Stato"
              value={onlyUnresolved ? "" : "1"}
            >
              <s-option value="">Solo non risolti</s-option>
              <s-option value="1">Tutti (anche risolti)</s-option>
            </s-select>
            <s-button type="submit">Applica filtri</s-button>
            <s-button href="/app/alerts" variant="tertiary">
              Reset
            </s-button>
          </s-stack>
        </form>
      </s-section>

      <s-section heading={`${alerts.length} alert (max 200)`}>
        {alerts.length === 0 ? (
          <s-paragraph>Nessun alert che corrisponda ai filtri.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Tipo</s-table-header>
              <s-table-header>Messaggio</s-table-header>
              <s-table-header>Prodotto</s-table-header>
              <s-table-header>Variante</s-table-header>
              <s-table-header>Stato</s-table-header>
              <s-table-header>Azioni</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {alerts.map((a) => (
                <s-table-row key={a.id}>
                  <s-table-cell>
                    <s-badge tone="critical">
                      {ERROR_CODE_LABEL[a.errorCode] ?? a.errorCode}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>{a.errorMessage}</s-table-cell>
                  <s-table-cell>
                    <s-text>{a.productId.split("/").pop() ?? a.productId}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    {a.variantId !== null
                      ? a.variantId.split("/").pop()
                      : "—"}
                  </s-table-cell>
                  <s-table-cell>
                    {a.resolvedAt === null ? (
                      <s-badge tone="critical">Aperto</s-badge>
                    ) : (
                      <s-badge tone="success">Risolto</s-badge>
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    <Link to={`/app/alerts/${a.id}`}>Apri</Link>
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
