import type { ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, redirect, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  parseAliases,
  parseLabels,
  sizeScaleFormSchema,
} from "../lib/validators/size-scale";
import { useSubmitting } from "../lib/ui/feedback";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

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

  const existing = await prisma.sizeScale.findUnique({
    where: {
      shopDomain_sigla: { shopDomain: session.shop, sigla: parsed.data.sigla },
    },
  });
  if (existing !== null) {
    return {
      errors: { sigla: ["Sigla già usata da un'altra scala"] },
      values: Object.fromEntries(formData),
    };
  }

  await prisma.sizeScale.create({
    data: {
      shopDomain: session.shop,
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

export default function ScaleNew() {
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const errors = actionData?.errors;
  const values = (actionData?.values ?? {}) as Record<string, string>;
  const creating = useSubmitting();

  return (
    <s-page heading="Nuova scala">
      <s-button slot="secondary-actions" href="/app/scales">
        Annulla
      </s-button>

      <s-section heading="Definisci la scala">
        <Form method="post">
          <s-stack direction="block" gap="base">
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-text-field
                name="sigla"
                label="Sigla"
                placeholder="es. MIA-SCALA"
                defaultValue={values.sigla ?? ""}
                error={errors?.sigla?.[0]}
              />
              <s-text-field
                name="name"
                label="Nome"
                placeholder="es. Sneakers Donna IT"
                defaultValue={values.name ?? ""}
                error={errors?.name?.[0]}
              />
            </s-grid>
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-select
                name="gender"
                label="Genere"
                value={values.gender ?? "UNISEX"}
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
                value={values.sourceScale ?? "EU"}
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
              defaultValue={values.labelsRaw ?? ""}
              error={errors?.labelsRaw?.[0]}
            />
            <s-text-area
              name="aliasesRaw"
              label="Alias (uno per riga, formato chiave=valore)"
              rows={6}
              defaultValue={values.aliasesRaw ?? ""}
              error={errors?.aliasesRaw?.[0]}
            />
            <s-box>
              <s-button type="submit" variant="primary" loading={creating}>
                Crea scala
              </s-button>
            </s-box>
          </s-stack>
        </Form>
      </s-section>

      <s-section slot="aside" heading="Come funziona">
        <s-stack direction="block" gap="base">
          <s-paragraph color="subdued">
            Una scala definisce le etichette taglia valide per un insieme di
            prodotti e come normalizzarle.
          </s-paragraph>
          <s-paragraph color="subdued">
            <s-text type="strong">1.</s-text> Inserisci le etichette esatte
            usate nelle varianti (es. 36, 36.5, 37…).
          </s-paragraph>
          <s-paragraph color="subdued">
            <s-text type="strong">2.</s-text> Aggiungi alias per le forme
            alternative che vuoi riconoscere (es. 36,5=36.5).
          </s-paragraph>
          <s-paragraph color="subdued">
            <s-text type="strong">3.</s-text> Crea una Conversion Table per
            questa scala con la matrice US/EU/UK/CM/JP.
          </s-paragraph>
          <s-paragraph color="subdued">
            <s-text type="strong">4.</s-text> Assegna la scala ai prodotti col
            metafield <s-text type="strong">size_norm.scale_sigla</s-text>.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
