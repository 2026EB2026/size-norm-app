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

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const sigla = decodeURIComponent(params.sigla ?? "");

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
    scale: {
      sigla: scale.sigla,
      name: scale.name,
      gender: scale.gender,
      sourceScale: scale.sourceScale,
      labelsRaw: labels.join("\n"),
      aliasesRaw: aliasesToRaw(aliases),
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

  return redirect(`/app/scales/${encodeURIComponent(parsed.data.sigla)}`);
};

type ActionData = {
  errors?: Partial<Record<string, string[]>>;
  values?: Record<string, unknown>;
};

export default function ScaleEdit() {
  const { scale } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const errors = actionData?.errors;

  return (
    <s-page heading={`Modifica scala: ${scale.sigla}`}>
      <s-button slot="secondary-actions" href="/app/scales">
        Torna alla lista
      </s-button>

      <s-section heading="Identità">
        <Form method="post">
          <s-stack direction="block" gap="base">
            <s-text-field
              name="sigla"
              label="Sigla"
              defaultValue={scale.sigla}
              error={errors?.sigla?.[0]}
            />
            <s-paragraph>
              <s-text>Identificatore stabile della scala (es. #G, DD, SH). Cambiandolo viene aggiornato il metafield prodotto in M4.</s-text>
            </s-paragraph>

            <s-text-field
              name="name"
              label="Nome"
              defaultValue={scale.name}
              error={errors?.name?.[0]}
            />

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
            <s-paragraph>
              <s-text>EU/US/UK/JP-mm = scala numerica diretta. DOUBLE = double sizing (Hoka, label tipo 3.5/5). MW_COMBINED = US M/W combinato (label tipo M8/W9.5).</s-text>
            </s-paragraph>

            <s-text-area
              name="labelsRaw"
              label="Etichette canoniche (una per riga)"
              rows={10}
              defaultValue={scale.labelsRaw}
              error={errors?.labelsRaw?.[0]}
            />
            <s-paragraph>
              <s-text>Inserisci le label nella forma esatta usata nelle varianti Shopify (rispetta ½, virgole, prefisso K, ecc.).</s-text>
            </s-paragraph>

            <s-text-area
              name="aliasesRaw"
              label="Alias (uno per riga, formato chiave=valore)"
              rows={6}
              defaultValue={scale.aliasesRaw}
              error={errors?.aliasesRaw?.[0]}
            />
            <s-paragraph>
              <s-text>Le chiavi sono normalizzate in minuscolo. Esempio: &apos;k10=K10&apos; mappa &apos;k10&apos; all&apos;etichetta canonica &apos;K10&apos;.</s-text>
            </s-paragraph>

            <s-button type="submit" variant="primary">
              Salva modifiche
            </s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section slot="aside" heading="Elimina scala">
        <s-paragraph>
          Cancella questa scala e tutte le sue Conversion Tables. Operazione irreversibile.
        </s-paragraph>
        <Form method="post">
          <input type="hidden" name="intent" value="delete" />
          <s-button type="submit" variant="primary" tone="critical">
            Elimina
          </s-button>
        </Form>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
