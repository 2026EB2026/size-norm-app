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
  conversionTableFormSchema,
  parseMappingsJson,
} from "../lib/validators/conversion-table";
import { useSubmitting } from "../lib/ui/feedback";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const scales = await prisma.sizeScale.findMany({
    where: { shopDomain: session.shop },
    orderBy: { sigla: "asc" },
    select: { sigla: true, name: true, labels: true },
  });

  return {
    scales: scales.map((s) => ({
      sigla: s.sigla,
      name: s.name,
      labels: Array.isArray(s.labels) ? (s.labels as string[]) : [],
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const parsed = conversionTableFormSchema.safeParse({
    scaleSigla: formData.get("scaleSigla"),
    brand: formData.get("brand"),
    mappingsJson: formData.get("mappingsJson"),
  });
  if (parsed.success === false) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  let mappings;
  try {
    mappings = parseMappingsJson(parsed.data.mappingsJson);
  } catch (e) {
    return {
      errors: {
        mappingsJson: [e instanceof Error ? e.message : "Errore parsing"],
      },
    };
  }

  const scaleExists = await prisma.sizeScale.findUnique({
    where: {
      shopDomain_sigla: {
        shopDomain: session.shop,
        sigla: parsed.data.scaleSigla,
      },
    },
  });
  if (scaleExists === null) {
    return { errors: { scaleSigla: ["Scala non trovata"] } };
  }

  const dup = await prisma.conversionTable.findFirst({
    where: {
      shopDomain: session.shop,
      scaleSigla: parsed.data.scaleSigla,
      brand: parsed.data.brand,
    },
  });
  if (dup !== null) {
    return {
      errors: {
        brand: [
          parsed.data.brand === null
            ? "Esiste già una tabella generic per questa scala"
            : `Esiste già una tabella per ${parsed.data.scaleSigla} × ${parsed.data.brand}`,
        ],
      },
    };
  }

  const created = await prisma.conversionTable.create({
    data: {
      shopDomain: session.shop,
      scaleSigla: parsed.data.scaleSigla,
      brand: parsed.data.brand,
      mappings: mappings as never,
      isSeed: false,
    },
  });

  return redirect(`/app/tables/${created.id}`);
};

type ActionData = {
  errors?: Partial<Record<string, string[]>>;
};

export default function TableNew() {
  const { scales } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const errors = actionData?.errors;
  const creating = useSubmitting();

  const firstScale = scales[0];
  const skeleton = firstScale
    ? JSON.stringify(
        firstScale.labels.map((label) => ({
          sourceLabel: label,
          us: null,
          eu: null,
          uk: null,
          cm: null,
          jpMm: null,
        })),
        null,
        2,
      )
    : "[]";

  return (
    <s-page heading="Nuova Conversion Table">
      <s-button slot="secondary-actions" href="/app/tables">
        Annulla
      </s-button>

      <s-section heading="Crea tabella">
        <Form method="post">
          <s-stack direction="block" gap="base">
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-select
                name="scaleSigla"
                label="Scala"
                value={firstScale?.sigla ?? ""}
                error={errors?.scaleSigla?.[0]}
              >
                {scales.map((s) => (
                  <s-option key={s.sigla} value={s.sigla}>
                    {s.sigla} — {s.name}
                  </s-option>
                ))}
              </s-select>
              <s-text-field
                name="brand"
                label="Brand (vuoto = generic)"
                placeholder="es. Gucci"
                error={errors?.brand?.[0]}
              />
            </s-grid>
            <s-text-area
              name="mappingsJson"
              label="Mappings (JSON)"
              rows={20}
              defaultValue={skeleton}
              error={errors?.mappingsJson?.[0]}
            />
            <s-box>
              <s-button type="submit" variant="primary" loading={creating}>
                Crea tabella
              </s-button>
            </s-box>
          </s-stack>
        </Form>
      </s-section>

      <s-section slot="aside" heading="Come compilare">
        <s-stack direction="block" gap="base">
          <s-paragraph color="subdued">
            Il JSON è pre-compilato con una riga per ogni etichetta della scala
            selezionata: riempi i valori di conversione e lascia{" "}
            <s-text type="strong">null</s-text> dove non disponibili.
          </s-paragraph>
          <s-paragraph color="subdued">
            <s-text type="strong">jpMm</s-text> è un intero in millimetri (es.
            250). <s-text type="strong">cm</s-text> è una stringa (es.
            &quot;25&quot;).
          </s-paragraph>
          <s-paragraph color="subdued">
            Una tabella <s-text type="strong">brand-specific</s-text> ha
            priorità sulla generic per i prodotti di quel vendor.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
