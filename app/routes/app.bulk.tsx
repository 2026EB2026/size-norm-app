import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { z } from "zod";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { inngest } from "../inngest/client";
import { useSubmitting } from "../lib/ui/feedback";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  // Recent jobs (last 20). Includes RUNNING jobs at top so the merchant can
  // see progress.
  const jobs = await prisma.bulkJob.findMany({
    where: { shopDomain: session.shop },
    orderBy: { startedAt: "desc" },
    take: 20,
  });

  // Scales for the "Reconvert by scale" dropdown.
  const scales = await prisma.sizeScale.findMany({
    where: { shopDomain: session.shop },
    orderBy: [{ gender: "asc" }, { sigla: "asc" }],
    select: { sigla: true, name: true },
  });

  // Distinct brand values from existing brand-specific conversion tables —
  // useful suggestions for the "Reconvert by brand" field.
  const brandRows = await prisma.conversionTable.findMany({
    where: { shopDomain: session.shop, brand: { not: null } },
    orderBy: { brand: "asc" },
    distinct: ["brand"],
    select: { brand: true },
  });
  const brands = brandRows
    .map((r) => r.brand)
    .filter((b): b is string => b !== null);

  return {
    jobs: jobs.map((j) => ({
      id: j.id,
      type: j.type,
      status: j.status,
      scaleSigla: j.scaleSigla,
      brand: j.brand,
      total: j.total,
      processed: j.processed,
      errors: j.errors,
      startedAt: j.startedAt.toISOString(),
      finishedAt: j.finishedAt?.toISOString() ?? null,
      errorMessage: j.errorMessage,
    })),
    scales,
    brands,
  };
};

const triggerSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("full-rescan") }),
  z.object({
    intent: z.literal("reconvert-by-scale"),
    scaleSigla: z.string().trim().min(1, "Sigla obbligatoria"),
  }),
  z.object({
    intent: z.literal("reconvert-by-brand"),
    brand: z.string().trim().min(1, "Brand obbligatorio"),
  }),
]);

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const raw = Object.fromEntries(formData);

  const parsed = triggerSchema.safeParse(raw);
  if (parsed.success === false) {
    return { errors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  // Refuse to start a new job if one is already running for this shop.
  const running = await prisma.bulkJob.count({
    where: { shopDomain: session.shop, status: { in: ["PENDING", "RUNNING"] } },
  });
  if (running > 0) {
    return {
      errors: {
        _form: [
          "Esiste già un job in esecuzione. Attendi che finisca prima di avviarne un altro.",
        ],
      },
    };
  }

  if (data.intent === "full-rescan") {
    const job = await prisma.bulkJob.create({
      data: {
        shopDomain: session.shop,
        type: "FULL_RESCAN",
      },
    });
    await inngest.send({
      name: "app/bulk.full-rescan.requested",
      data: { shopDomain: session.shop, jobId: job.id },
    });
  } else if (data.intent === "reconvert-by-scale") {
    const job = await prisma.bulkJob.create({
      data: {
        shopDomain: session.shop,
        type: "RECONVERT_BY_SCALE",
        scaleSigla: data.scaleSigla,
      },
    });
    await inngest.send({
      name: "app/bulk.reconvert-by-scale.requested",
      data: {
        shopDomain: session.shop,
        jobId: job.id,
        scaleSigla: data.scaleSigla,
      },
    });
  } else {
    const job = await prisma.bulkJob.create({
      data: {
        shopDomain: session.shop,
        type: "RECONVERT_BY_BRAND",
        brand: data.brand,
      },
    });
    await inngest.send({
      name: "app/bulk.reconvert-by-brand.requested",
      data: {
        shopDomain: session.shop,
        jobId: job.id,
        brand: data.brand,
      },
    });
  }

  return redirect("/app/bulk");
};

const STATUS_TONE: Record<string, "info" | "success" | "critical" | "neutral"> =
  {
    PENDING: "neutral",
    RUNNING: "info",
    COMPLETED: "success",
    FAILED: "critical",
  };

const TYPE_LABEL: Record<string, string> = {
  FULL_RESCAN: "Re-scan completo",
  RECONVERT_BY_SCALE: "Reconvert per scala",
  RECONVERT_BY_BRAND: "Reconvert per brand",
};

type ActionData = {
  errors?: Partial<Record<string, string[]>>;
};

export default function BulkAdmin() {
  const { jobs, scales, brands } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const errors = actionData?.errors;

  const runningJob = jobs.find(
    (j) => j.status === "RUNNING" || j.status === "PENDING",
  );
  const startingFull = useSubmitting("full-rescan");
  const startingScale = useSubmitting("reconvert-by-scale");
  const startingBrand = useSubmitting("reconvert-by-brand");

  return (
    <s-page heading="Bulk re-scan">
      {runningJob !== undefined && (
        <s-banner
          heading={`${TYPE_LABEL[runningJob.type] ?? runningJob.type} in corso`}
          tone="info"
        >
          <s-stack direction="inline" gap="small">
            <s-spinner size="base" accessibilityLabel="Job in esecuzione" />
            <s-text>
              {runningJob.processed} / {runningJob.total} prodotti processati
              {runningJob.errors > 0
                ? ` · ${runningJob.errors} errori`
                : ""}{" "}
              — aggiorna la pagina per lo stato più recente.
            </s-text>
          </s-stack>
        </s-banner>
      )}

      <s-section heading="Avvia un nuovo job">
        {errors?._form !== undefined && (
          <s-banner tone="critical">
            <s-text>{errors._form[0]}</s-text>
          </s-banner>
        )}

        <s-grid
          gridTemplateColumns="repeat(auto-fit, minmax(240px, 1fr))"
          gap="base"
        >
          <s-box padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="base">
              <s-heading>Tutto il catalogo</s-heading>
              <s-paragraph color="subdued">
                Ricalcola i metafield di conversione per tutti i prodotti
                footwear. Usalo dopo il primo setup o dopo aver cambiato la
                configurazione globale.
              </s-paragraph>
              <Form method="post">
                <input type="hidden" name="intent" value="full-rescan" />
                <s-button type="submit" variant="primary" loading={startingFull}>
                  Avvia re-scan completo
                </s-button>
              </Form>
            </s-stack>
          </s-box>

          <s-box padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="base">
              <s-heading>Per scala</s-heading>
              <s-paragraph color="subdued">
                Riprocessa solo i prodotti di una scala specifica. Utile dopo
                aver modificato labels o aliases.
              </s-paragraph>
              <Form method="post">
                <input
                  type="hidden"
                  name="intent"
                  value="reconvert-by-scale"
                />
                <s-stack direction="block" gap="small">
                  <s-select
                    name="scaleSigla"
                    label="Scala"
                    value={scales[0]?.sigla ?? ""}
                    error={errors?.scaleSigla?.[0]}
                  >
                    {scales.map((s) => (
                      <s-option key={s.sigla} value={s.sigla}>
                        {s.sigla} — {s.name}
                      </s-option>
                    ))}
                  </s-select>
                  <s-button
                    type="submit"
                    variant="secondary"
                    loading={startingScale}
                  >
                    Reconvert
                  </s-button>
                </s-stack>
              </Form>
            </s-stack>
          </s-box>

          <s-box padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="base">
              <s-heading>Per brand</s-heading>
              <s-paragraph color="subdued">
                Riprocessa solo i prodotti del brand indicato. Utile dopo aver
                creato o modificato una Conversion Table brand-specific.
              </s-paragraph>
              <Form method="post">
                <input
                  type="hidden"
                  name="intent"
                  value="reconvert-by-brand"
                />
                <s-stack direction="block" gap="small">
                  <s-text-field
                    name="brand"
                    label="Brand"
                    placeholder="es. Asics"
                    error={errors?.brand?.[0]}
                  />
                  <s-button
                    type="submit"
                    variant="secondary"
                    loading={startingBrand}
                  >
                    Reconvert
                  </s-button>
                </s-stack>
              </Form>
              {brands.length > 0 && (
                <s-text color="subdued">
                  Con tabella specifica: {brands.join(", ")}
                </s-text>
              )}
            </s-stack>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading={`Ultimi ${jobs.length} job`}>
        {jobs.length === 0 ? (
          <s-paragraph>Nessun job avviato finora.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Tipo</s-table-header>
              <s-table-header>Stato</s-table-header>
              <s-table-header>Filtro</s-table-header>
              <s-table-header>Progresso</s-table-header>
              <s-table-header>Errori</s-table-header>
              <s-table-header>Inizio</s-table-header>
              <s-table-header>Fine</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {jobs.map((j) => (
                <s-table-row key={j.id}>
                  <s-table-cell>{TYPE_LABEL[j.type] ?? j.type}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={STATUS_TONE[j.status] ?? "neutral"}>
                      {j.status}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    {j.scaleSigla !== null
                      ? `Scala: ${j.scaleSigla}`
                      : j.brand !== null
                        ? `Brand: ${j.brand}`
                        : "—"}
                  </s-table-cell>
                  <s-table-cell>
                    {j.processed} / {j.total}
                  </s-table-cell>
                  <s-table-cell>{j.errors}</s-table-cell>
                  <s-table-cell>{j.startedAt.replace("T", " ").slice(0, 19)}</s-table-cell>
                  <s-table-cell>
                    {j.finishedAt !== null
                      ? j.finishedAt.replace("T", " ").slice(0, 19)
                      : "—"}
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
