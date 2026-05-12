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

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tableId = params.tableId ?? "";

  const table = await prisma.conversionTable.findFirst({
    where: { id: tableId, shopDomain: session.shop },
  });
  if (table === null) {
    throw new Response("Tabella non trovata", { status: 404 });
  }

  return {
    table: {
      id: table.id,
      scaleSigla: table.scaleSigla,
      brand: table.brand,
      isSeed: table.isSeed,
      mappings: table.mappings,
    },
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tableId = params.tableId ?? "";
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    const owned = await prisma.conversionTable.findFirst({
      where: { id: tableId, shopDomain: session.shop },
    });
    if (owned === null) throw new Response("Not found", { status: 404 });
    await prisma.conversionTable.delete({ where: { id: tableId } });
    return redirect("/app/tables");
  }

  if (intent === "mark-validated") {
    const owned = await prisma.conversionTable.findFirst({
      where: { id: tableId, shopDomain: session.shop },
    });
    if (owned === null) throw new Response("Not found", { status: 404 });
    await prisma.conversionTable.update({
      where: { id: tableId },
      data: { isSeed: false },
    });
    return { ok: true as const };
  }

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

  const owned = await prisma.conversionTable.findFirst({
    where: { id: tableId, shopDomain: session.shop },
  });
  if (owned === null) throw new Response("Not found", { status: 404 });

  await prisma.conversionTable.update({
    where: { id: tableId },
    data: {
      scaleSigla: parsed.data.scaleSigla,
      brand: parsed.data.brand,
      mappings,
      isSeed: false,
    },
  });

  return redirect(`/app/tables/${tableId}`);
};

type ActionData = {
  errors?: Partial<Record<string, string[]>>;
  ok?: true;
};

export default function TableEdit() {
  const { table } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const errors = actionData?.errors;

  return (
    <s-page
      heading={`Conversion Table: ${table.scaleSigla}${
        table.brand !== null ? ` × ${table.brand}` : " (Generic)"
      }`}
    >
      <s-button slot="secondary-actions" href="/app/tables">
        Torna alla lista
      </s-button>

      {table.isSeed && (
        <s-banner tone="info">
          <s-text>
            Questa tabella è seed. Salvando le modifiche verrà marcata come validata.
            In alternativa usa il bottone &quot;Marca validata&quot; nella colonna laterale.
          </s-text>
        </s-banner>
      )}

      <s-section heading="Modifica tabella">
        <Form method="post">
          <s-stack direction="block" gap="base">
            <s-text-field
              name="scaleSigla"
              label="Sigla scala"
              defaultValue={table.scaleSigla}
              error={errors?.scaleSigla?.[0]}
            />
            <s-text-field
              name="brand"
              label="Brand (vuoto = tabella generic)"
              defaultValue={table.brand ?? ""}
              error={errors?.brand?.[0]}
            />
            <s-text-area
              name="mappingsJson"
              label="Mappings (JSON)"
              rows={20}
              defaultValue={JSON.stringify(table.mappings, null, 2)}
              error={errors?.mappingsJson?.[0]}
            />
            <s-paragraph>
              <s-text>
                Array di oggetti &#123; sourceLabel, us, eu, uk, jpMm &#125;. us/eu/uk possono essere null. jpMm è intero in mm.
              </s-text>
            </s-paragraph>
            <s-button type="submit" variant="primary">
              Salva (e marca come validata)
            </s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section slot="aside" heading="Azioni">
        {table.isSeed && (
          <Form method="post">
            <input type="hidden" name="intent" value="mark-validated" />
            <s-button type="submit">Marca validata (senza modifiche)</s-button>
          </Form>
        )}

        <s-paragraph>
          Eliminare una tabella generic fa fallback alla logica di lookup. Eliminare
          una tabella brand-specific fa cadere il brand sulla generic.
        </s-paragraph>
        <Form method="post">
          <input type="hidden" name="intent" value="delete" />
          <s-button type="submit" variant="primary" tone="critical">
            Elimina tabella
          </s-button>
        </Form>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
