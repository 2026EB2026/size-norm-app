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
      mappings,
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

  const firstScale = scales[0];
  const skeleton = firstScale
    ? JSON.stringify(
        firstScale.labels.map((label) => ({
          sourceLabel: label,
          us: null,
          eu: null,
          uk: null,
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
              error={errors?.brand?.[0]}
            />
            <s-text-area
              name="mappingsJson"
              label="Mappings (JSON)"
              rows={20}
              defaultValue={skeleton}
              error={errors?.mappingsJson?.[0]}
            />
            <s-paragraph>
              <s-text>
                Modifica l&apos;array sotto. Lascia null per i campi senza
                conversione disponibile. jpMm è intero (es. 250).
              </s-text>
            </s-paragraph>
            <s-button type="submit" variant="primary">
              Crea tabella
            </s-button>
          </s-stack>
        </Form>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
