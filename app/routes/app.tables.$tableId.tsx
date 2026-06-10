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
import { useSaveToast, useSubmitting } from "../lib/ui/feedback";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const tableId = params.tableId ?? "";
  const url = new URL(request.url);

  const table = await prisma.conversionTable.findFirst({
    where: { id: tableId, shopDomain: session.shop },
  });
  if (table === null) {
    throw new Response("Tabella non trovata", { status: 404 });
  }

  return {
    saved: url.searchParams.get("saved") === "1",
    table: {
      id: table.id,
      scaleSigla: table.scaleSigla,
      brand: table.brand,
      isSeed: table.isSeed,
      mappings: table.mappings,
      mappingsCount: Array.isArray(table.mappings) ? table.mappings.length : 0,
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
      mappings: mappings as never,
      isSeed: false,
    },
  });

  return redirect(`/app/tables/${tableId}?saved=1`);
};

type ActionData = {
  errors?: Partial<Record<string, string[]>>;
  ok?: true;
};

export default function TableEdit() {
  const { table, saved } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const errors = actionData?.errors;
  const anySubmitting = useSubmitting();
  const validating = useSubmitting("mark-validated");
  const deleting = useSubmitting("delete");
  const saving = anySubmitting && !validating && !deleting;

  useSaveToast(saved, "Tabella salvata");
  useSaveToast(actionData?.ok, "Tabella marcata come validata");

  return (
    <s-page
      heading={`Conversion Table: ${table.scaleSigla}${
        table.brand !== null ? ` × ${table.brand}` : ""
      }`}
    >
      <s-button slot="secondary-actions" href="/app/tables">
        Torna alla lista
      </s-button>

      {table.isSeed && (
        <s-banner heading="Tabella seed" tone="info">
          <s-text>
            Fornita dall&apos;app e aggiornata automaticamente. Salvando una
            modifica diventa di tua proprietà e gli aggiornamenti automatici si
            fermano.
          </s-text>
        </s-banner>
      )}

      <s-section heading="Modifica tabella">
        <s-stack direction="inline" gap="small">
          {table.isSeed ? (
            <s-badge tone="info">Seed</s-badge>
          ) : (
            <s-badge tone="success">Validata</s-badge>
          )}
          <s-badge tone="neutral">{`${table.mappingsCount} mappings`}</s-badge>
          <s-badge tone="neutral">
            {table.brand === null ? "Generic" : `Brand: ${table.brand}`}
          </s-badge>
        </s-stack>

        <Form method="post">
          <s-stack direction="block" gap="base">
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
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
            </s-grid>
            <s-text-area
              name="mappingsJson"
              label="Mappings (JSON)"
              rows={20}
              defaultValue={JSON.stringify(table.mappings, null, 2)}
              error={errors?.mappingsJson?.[0]}
            />
            <s-box>
              <s-button type="submit" variant="primary" loading={saving}>
                Salva (e marca come validata)
              </s-button>
            </s-box>
          </s-stack>
        </Form>
      </s-section>

      <s-section slot="aside" heading="Formato mappings">
        <s-paragraph color="subdued">
          Array di oggetti{" "}
          <s-text type="strong">
            &#123; sourceLabel, us, eu, uk, cm, jpMm &#125;
          </s-text>
          . I campi senza conversione possono essere null. jpMm è un intero in
          millimetri (es. 250); cm è una stringa (es. &quot;25&quot;).
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Azioni">
        <s-stack direction="block" gap="base">
          {table.isSeed && (
            <Form method="post">
              <input type="hidden" name="intent" value="mark-validated" />
              <s-button type="submit" loading={validating}>
                Marca validata (senza modifiche)
              </s-button>
            </Form>
          )}
          <s-paragraph color="subdued">
            Eliminando una tabella brand-specific il brand fa fallback sulla
            generic; eliminando la generic, la scala resta senza conversioni.
          </s-paragraph>
          <Form method="post">
            <input type="hidden" name="intent" value="delete" />
            <s-button
              type="submit"
              variant="primary"
              tone="critical"
              loading={deleting}
            >
              Elimina tabella
            </s-button>
          </Form>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
