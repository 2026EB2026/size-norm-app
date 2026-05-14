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

  return (
    <s-page heading="Bulk re-scan">
      <s-section heading="Avvia un nuovo job">
        {errors?._form !== undefined && (
          <s-banner tone="critical">
            <s-text>{errors._form[0]}</s-text>
          </s-banner>
        )}

        <s-stack direction="block" gap="large">
          <s-section heading="Scansiona tutto il catalogo">
            <s-paragraph>
              Pagina tutti i prodotti footwear e ricalcola i metafield di
              conversione. Usalo dopo aver caricato dati iniziali o cambiato la
              configurazione globale.
            </s-paragraph>
            <Form method="post">
              <input type="hidden" name="intent" value="full-rescan" />
              <s-button type="submit" variant="primary">
                Avvia re-scan completo
              </s-button>
            </Form>
          </s-section>

          <s-section heading="Reconvert per scala">
            <s-paragraph>
              Riprocessa solo i prodotti che usano una specifica scala. Utile
              dopo aver modificato labels/aliases di una scala.
            </s-paragraph>
            <Form method="post">
              <input type="hidden" name="intent" value="reconvert-by-scale" />
              <s-stack direction="inline" gap="base">
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
                <s-button type="submit" variant="primary">
                  Reconvert
                </s-button>
              </s-stack>
            </Form>
          </s-section>

          <s-section heading="Reconvert per brand">
            <s-paragraph>
              Riprocessa solo i prodotti del brand specificato. Utile dopo aver
              creato/modificato una Conversion Table brand-specific.
            </s-paragraph>
            <Form method="post">
              <input type="hidden" name="intent" value="reconvert-by-brand" />
              <s-stack direction="inline" gap="base">
                <s-text-field
                  name="brand"
                  label="Brand"
                  error={errors?.brand?.[0]}
                />
                <s-button type="submit" variant="primary">
                  Reconvert
                </s-button>
              </s-stack>
            </Form>
            {brands.length > 0 && (
              <s-paragraph>
                <s-text>
                  Brand con Conversion Table specifica: {brands.join(", ")}
                </s-text>
              </s-paragraph>
            )}
          </s-section>
        </s-stack>
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

        <s-paragraph>
          <s-text>
            Aggiorna la pagina per vedere lo stato avanzato dei job in
            esecuzione. (Auto-refresh live verrà aggiunto in M7.)
          </s-text>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
