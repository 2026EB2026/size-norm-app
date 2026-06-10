import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const [
    scalesCount,
    tablesCount,
    openAlertsCount,
    processedCount,
    lastJob,
    shop,
  ] = await Promise.all([
    prisma.sizeScale.count({ where: { shopDomain } }),
    prisma.conversionTable.count({ where: { shopDomain } }),
    prisma.conversionAlert.count({
      where: { shopDomain, resolvedAt: null },
    }),
    prisma.productSnapshot.count({ where: { shopDomain } }),
    prisma.bulkJob.findFirst({
      where: { shopDomain },
      orderBy: { startedAt: "desc" },
    }),
    prisma.shop.findUnique({ where: { shopDomain } }),
  ]);

  return {
    shopDomain,
    stats: {
      scalesCount,
      tablesCount,
      openAlertsCount,
      processedCount,
    },
    lastJob:
      lastJob === null
        ? null
        : {
            type: lastJob.type,
            status: lastJob.status,
            processed: lastJob.processed,
            total: lastJob.total,
            errors: lastJob.errors,
            startedAt: lastJob.startedAt.toISOString(),
          },
    setup: {
      seeded: scalesCount > 0,
      processedSomething: processedCount > 0,
      brandRulesConfigured:
        shop?.brandDisplayScales !== null &&
        shop?.brandDisplayScales !== undefined,
    },
  };
};

const JOB_TYPE_LABEL: Record<string, string> = {
  FULL_RESCAN: "Re-scan completo",
  RECONVERT_BY_SCALE: "Reconvert per scala",
  RECONVERT_BY_BRAND: "Reconvert per brand",
};

const JOB_STATUS_TONE: Record<
  string,
  "info" | "success" | "critical" | "neutral"
> = {
  PENDING: "neutral",
  RUNNING: "info",
  COMPLETED: "success",
  FAILED: "critical",
};

function StatCard(props: {
  label: string;
  value: number;
  href: string;
  linkLabel: string;
  tone?: "critical";
}) {
  return (
    <s-box padding="base" border="base" borderRadius="base">
      <s-stack direction="block" gap="small">
        <s-text color="subdued">{props.label}</s-text>
        <s-heading>
          {props.tone === "critical" && props.value > 0 ? (
            <s-text tone="critical" type="strong">
              {String(props.value)}
            </s-text>
          ) : (
            String(props.value)
          )}
        </s-heading>
        <s-link href={props.href}>{props.linkLabel}</s-link>
      </s-stack>
    </s-box>
  );
}

export default function Index() {
  const { stats, lastJob, setup } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Size Norm">
      {stats.openAlertsCount > 0 && (
        <s-banner
          heading={`${stats.openAlertsCount} prodotti richiedono attenzione`}
          tone="warning"
        >
          <s-stack direction="block" gap="small">
            <s-text>
              Alcuni prodotti non sono stati convertiti e sono stati messi in
              Draft. Risolvi gli alert per ripubblicarli.
            </s-text>
            <s-button href="/app/alerts" variant="secondary">
              Vai agli alert
            </s-button>
          </s-stack>
        </s-banner>
      )}

      <s-section heading="Panoramica">
        <s-grid
          gridTemplateColumns="repeat(auto-fit, minmax(150px, 1fr))"
          gap="base"
        >
          <StatCard
            label="Prodotti processati"
            value={stats.processedCount}
            href="/app/bulk"
            linkLabel="Bulk re-scan"
          />
          <StatCard
            label="Alert aperti"
            value={stats.openAlertsCount}
            href="/app/alerts"
            linkLabel="Gestisci"
            tone="critical"
          />
          <StatCard
            label="Scale taglie"
            value={stats.scalesCount}
            href="/app/scales"
            linkLabel="Gestisci"
          />
          <StatCard
            label="Conversion table"
            value={stats.tablesCount}
            href="/app/tables"
            linkLabel="Gestisci"
          />
        </s-grid>
      </s-section>

      <s-section heading="Come funziona">
        <s-ordered-list>
          <s-list-item>
            Imposta <s-text type="strong">gender</s-text> (e per i prodotti kid{" "}
            <s-text type="strong">age_category</s-text>) nei metafield{" "}
            <s-text type="strong">size_norm</s-text> del prodotto. La scala
            viene derivata automaticamente da brand + gender (es.{" "}
            <s-text type="strong">asics-women-adult</s-text>).
          </s-list-item>
          <s-list-item>
            Ad ogni creazione o modifica prodotto l&apos;app converte le taglie
            delle varianti nella matrice US / EU / UK / CM / JP e la scrive nei
            metafield.
          </s-list-item>
          <s-list-item>
            Il blocco <s-text type="strong">Size Norm — Sizes</s-text> nel
            theme editor mostra la conversione in PDP. La scala principale è
            configurabile per brand da Settings.
          </s-list-item>
          <s-list-item>
            Se una conversione fallisce, il prodotto va in Draft e compare un
            alert con la diagnosi e il fix suggerito.
          </s-list-item>
        </s-ordered-list>
      </s-section>

      <s-section slot="aside" heading="Setup">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="small">
            <s-badge tone={setup.seeded ? "success" : "neutral"}>
              {setup.seeded ? "Fatto" : "Da fare"}
            </s-badge>
            <s-text>Scale e tabelle caricate</s-text>
          </s-stack>
          <s-stack direction="inline" gap="small">
            <s-badge tone={setup.processedSomething ? "success" : "neutral"}>
              {setup.processedSomething ? "Fatto" : "Da fare"}
            </s-badge>
            <s-text>Primo prodotto processato</s-text>
          </s-stack>
          <s-stack direction="inline" gap="small">
            <s-badge tone={setup.brandRulesConfigured ? "success" : "neutral"}>
              {setup.brandRulesConfigured ? "Fatto" : "Opzionale"}
            </s-badge>
            <s-text>Scala principale per brand</s-text>
          </s-stack>
          <s-divider />
          <s-button href="/app/bulk" variant="primary">
            Avvia re-scan catalogo
          </s-button>
          <s-button href="/app/settings" variant="secondary">
            Settings
          </s-button>
        </s-stack>
      </s-section>

      {lastJob !== null && (
        <s-section slot="aside" heading="Ultimo job">
          <s-stack direction="block" gap="small">
            <s-stack direction="inline" gap="small">
              <s-badge tone={JOB_STATUS_TONE[lastJob.status] ?? "neutral"}>
                {lastJob.status}
              </s-badge>
              <s-text>{JOB_TYPE_LABEL[lastJob.type] ?? lastJob.type}</s-text>
            </s-stack>
            <s-text color="subdued">
              {lastJob.processed} / {lastJob.total} prodotti
              {lastJob.errors > 0 ? ` · ${lastJob.errors} errori` : ""}
            </s-text>
            <s-link href="/app/bulk">Dettagli</s-link>
          </s-stack>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
