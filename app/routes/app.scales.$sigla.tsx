import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  aliasesToRaw,
  parseAliases,
  parseLabels,
  sizeScaleFormSchema,
} from "../lib/validators/size-scale";
import { useSaveToast, useSubmitting } from "../lib/ui/feedback";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const sigla = decodeURIComponent(params.sigla ?? "");
  const url = new URL(request.url);

  const scale = await prisma.sizeScale.findUnique({
    where: { shopDomain_sigla: { shopDomain: session.shop, sigla } },
  });

  if (scale === null) {
    throw new Response("Scala non trovata", { status: 404 });
  }

  const labels = Array.isArray(scale.labels) ? (scale.labels as string[]) : [];
  const aliases =
    scale.aliases !== null && typeof scale.aliases === "object"
      ? (scale.aliases as Record<string, string>)
      : {};

  return {
    saved: url.searchParams.get("saved") === "1",
    scale: {
      sigla: scale.sigla,
      name: scale.name,
      gender: scale.gender,
      sourceScale: scale.sourceScale,
      labelsRaw: labels.join("\n"),
      aliasesRaw: aliasesToRaw(aliases),
      labelsCount: labels.length,
      aliasesCount: Object.keys(aliases).length,
    },
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const sigla = decodeURIComponent(params.sigla ?? "");
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    await prisma.sizeScale.delete({
      where: { shopDomain_sigla: { shopDomain: session.shop, sigla } },
    });
    return redirect("/app/scales");
  }

  const parsed = sizeScaleFormSchema.safeParse({
    sigla: formData.get("sigla"),
    name: formData.get("name"),
    gender: formData.get("gender"),
    sourceScale: formData.get("sourceScale"),
    labelsRaw: formData.get("labelsRaw"),
    aliasesRaw: formData.get("aliasesRaw") ?? "",
  });

  if (parsed.success === false) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      values: Object.fromEntries(formData),
    };
  }

  const labels = parseLabels(parsed.data.labelsRaw);
  if (labels.length === 0) {
    return {
      errors: { labelsRaw: ["Inserisci almeno un'etichetta valida"] },
      values: Object.fromEntries(formData),
    };
  }
  const aliases = parseAliases(parsed.data.aliasesRaw);

  for (const target of Object.values(aliases)) {
    if (!labels.includes(target)) {
      return {
        errors: {
          aliasesRaw: [
            `Alias punta a "${target}" che non è tra le etichette canoniche`,
          ],
        },
        values: Object.fromEntries(formData),
      };
    }
  }

  if (parsed.data.sigla !== sigla) {
    const newSiglaTaken = await prisma.sizeScale.findUnique({
      where: {
        shopDomain_sigla: {
          shopDomain: session.shop,
          sigla: parsed.data.sigla,
        },
      },
    });
    if (newSiglaTaken !== null) {
      return {
        errors: { sigla: ["Sigla già usata da un'altra scala"] },
        values: Object.fromEntries(formData),
      };
    }
  }

  await prisma.sizeScale.update({
    where: { shopDomain_sigla: { shopDomain: session.shop, sigla } },
    data: {
      sigla: parsed.data.sigla,
      name: parsed.data.name,
      gender: parsed.data.gender,
      sourceScale: parsed.data.sourceScale,
      labels,
      aliases,
    },
  });

  return redirect(
    `/app/scales/${encodeURIComponent(parsed.data.sigla)}?saved=1`,
  );
};

type ActionData = {
  errors?: Partial<Record<string, string[]>>;
  values?: Record<string, unknown>;
};

const GENDER_LABEL: Record<string, string> = {
  MEN: "Uomo",
  WOMEN: "Donna",
  UNISEX: "Unisex",
  KID: "Bambino",
};

export default function ScaleEdit() {
  const { scale, saved } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const errors = actionData?.errors;
  const saving = useSubmitting();
  const deleting = useSubmitting("delete");

  useSaveToast(saved, "Scala salvata");

  return (
    <s-page heading={`Scala ${scale.sigla}`}>
      <s-button slot="secondary-actions" href="/app/scales">
        Torna alla lista
      </s-button>

      <s-section heading="Identità">
        <s-stack direction="inline" gap="small">
          <s-badge tone="neutral">
            {GENDER_LABEL[scale.gender] ?? scale.gender}
          </s-badge>
          <s-badge tone="neutral">{`${scale.labelsCount} etichette`}</s-badge>
          <s-badge tone="neutral">{`${scale.aliasesCount} alias`}</s-badge>
        </s-stack>

        <Form method="post">
          <s-stack direction="block" gap="base">
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-text-field
                name="sigla"
                label="Sigla"
                defaultValue={scale.sigla}
                error={errors?.sigla?.[0]}
              />
              <s-text-field
                name="name"
                label="Nome"
                defaultValue={scale.name}
                error={errors?.name?.[0]}
              />
            </s-grid>

            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-select
                name="gender"
                label="Genere"
                value={scale.gender}
                error={errors?.gender?.[0]}
              >
                <s-option value="MEN">Uomo</s-option>
                <s-option value="WOMEN">Donna</s-option>
                <s-option value="UNISEX">Unisex</s-option>
                <s-option value="KID">Bambino</s-option>
              </s-select>

              <s-select
                name="sourceScale"
                label="Scala base"
                value={scale.sourceScale}
                error={errors?.sourceScale?.[0]}
              >
                <s-option value="EU">EU</s-option>
                <s-option value="US">US</s-option>
                <s-option value="UK">UK</s-option>
                <s-option value="JP_MM">JP mondopoint (mm)</s-option>
                <s-option value="DOUBLE">Double sizing</s-option>
                <s-option value="MW_COMBINED">M/W combinato</s-option>
              </s-select>
            </s-grid>

            <s-text-area
              name="labelsRaw"
              label="Etichette canoniche (una per riga)"
              rows={10}
              defaultValue={scale.labelsRaw}
              error={errors?.labelsRaw?.[0]}
            />

            <s-text-area
              name="aliasesRaw"
              label="Alias (uno per riga, formato chiave=valore)"
              rows={6}
              defaultValue={scale.aliasesRaw}
              error={errors?.aliasesRaw?.[0]}
            />

            <s-box>
              <s-button
                type="submit"
                variant="primary"
                loading={saving && !deleting}
              >
                Salva modifiche
              </s-button>
            </s-box>
          </s-stack>
        </Form>
      </s-section>

      <s-section slot="aside" heading="Suggerimenti">
        <s-stack direction="block" gap="base">
          <s-paragraph color="subdued">
            <s-text type="strong">Etichette</s-text> — inserisci le label nella
            forma esatta usata nelle varianti Shopify (½, virgole, prefisso K,
            ecc.).
          </s-paragraph>
          <s-paragraph color="subdued">
            <s-text type="strong">Alias</s-text> — le chiavi sono normalizzate
            in minuscolo. Es. <s-text type="strong">k10=K10</s-text> mappa
            l&apos;input &quot;k10&quot; all&apos;etichetta canonica
            &quot;K10&quot;.
          </s-paragraph>
          <s-paragraph color="subdued">
            <s-text type="strong">Scala base</s-text> — EU/US/UK/JP-mm =
            numerica diretta. DOUBLE = double sizing (es. 3.5/5). MW_COMBINED =
            US M/W combinato (es. M8/W9.5).
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Zona pericolosa">
        <s-paragraph color="subdued">
          Elimina questa scala e tutte le sue Conversion Tables. Operazione
          irreversibile.
        </s-paragraph>
        <Form method="post">
          <input type="hidden" name="intent" value="delete" />
          <s-button
            type="submit"
            variant="primary"
            tone="critical"
            loading={deleting}
          >
            Elimina scala
          </s-button>
        </Form>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
