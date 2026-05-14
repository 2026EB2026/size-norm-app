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
import {
  setMetafields,
  updateProductStatusAndTags,
  type MetafieldWrite,
} from "../lib/shopify/client";
import {
  applyTagDelta,
  SIZE_NORM_ERROR_TAG,
} from "../lib/processor/apply-result";
import { runProcessor } from "../lib/processor";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const id = params.id ?? "";

  const alert = await prisma.conversionAlert.findFirst({
    where: { id, shopDomain: session.shop },
  });
  if (alert === null) {
    throw new Response("Alert non trovato", { status: 404 });
  }

  return {
    alert: {
      id: alert.id,
      productId: alert.productId,
      variantId: alert.variantId,
      errorCode: alert.errorCode,
      errorMessage: alert.errorMessage,
      payload: alert.payload,
      createdAt: alert.createdAt.toISOString(),
      resolvedAt: alert.resolvedAt?.toISOString() ?? null,
      resolvedBy: alert.resolvedBy,
    },
  };
};

/**
 * Schema for the manual-override form. All four conversion columns are
 * accepted as strings; jpMm is coerced to int.
 */
const overrideSchema = z.object({
  us: z.string().trim().min(1, "US obbligatorio"),
  eu: z.string().trim().min(1, "EU obbligatorio"),
  uk: z.string().trim().min(1, "UK obbligatorio"),
  jpMm: z.coerce
    .number()
    .int()
    .positive("JP-mm deve essere un intero positivo"),
  sourceLabel: z.string().trim().min(1, "Etichetta originale obbligatoria"),
});

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const id = params.id ?? "";
  const formData = await request.formData();
  const intent = formData.get("intent");

  const alert = await prisma.conversionAlert.findFirst({
    where: { id, shopDomain: session.shop },
  });
  if (alert === null) throw new Response("Alert non trovato", { status: 404 });

  if (intent === "reprocess") {
    // Re-run the processor on this product, ignoring the snapshot hash so we
    // pick up any edits the merchant made directly in Shopify admin.
    await runProcessor(admin, prisma, session.shop, alert.productId, {
      force: true,
    });
    return redirect("/app/alerts");
  }

  if (intent === "dismiss") {
    await prisma.conversionAlert.update({
      where: { id },
      data: { resolvedAt: new Date(), resolvedBy: "dismissed" },
    });
    return redirect("/app/alerts");
  }

  if (intent === "override") {
    if (alert.variantId === null) {
      return {
        errors: {
          _form: [
            "Manual override disponibile solo per alert variant-level, non product-level.",
          ],
        },
      };
    }

    const parsed = overrideSchema.safeParse({
      us: formData.get("us"),
      eu: formData.get("eu"),
      uk: formData.get("uk"),
      jpMm: formData.get("jpMm"),
      sourceLabel: formData.get("sourceLabel"),
    });
    if (parsed.success === false) {
      return { errors: parsed.error.flatten().fieldErrors };
    }
    const { us, eu, uk, jpMm, sourceLabel } = parsed.data;
    const variantId = alert.variantId;

    // 1. Write variant metafields with manual_override = true.
    const writes: MetafieldWrite[] = [
      {
        ownerId: variantId,
        namespace: "size_norm",
        key: "us",
        type: "single_line_text_field",
        value: us,
      },
      {
        ownerId: variantId,
        namespace: "size_norm",
        key: "eu",
        type: "single_line_text_field",
        value: eu,
      },
      {
        ownerId: variantId,
        namespace: "size_norm",
        key: "uk",
        type: "single_line_text_field",
        value: uk,
      },
      {
        ownerId: variantId,
        namespace: "size_norm",
        key: "jp_mm",
        type: "number_integer",
        value: String(jpMm),
      },
      {
        ownerId: variantId,
        namespace: "size_norm",
        key: "matrix",
        type: "json",
        value: JSON.stringify({ us, eu, uk, jpMm }),
      },
      {
        ownerId: variantId,
        namespace: "size_norm",
        key: "source_label",
        type: "single_line_text_field",
        value: sourceLabel,
      },
      {
        ownerId: variantId,
        namespace: "size_norm",
        key: "manual_override",
        type: "boolean",
        value: "true",
      },
    ];
    await setMetafields(admin, writes);

    // 2. Mark this alert resolved.
    await prisma.conversionAlert.update({
      where: { id },
      data: { resolvedAt: new Date(), resolvedBy: "manual_override" },
    });

    // 3. If no other unresolved alerts on this product, set ACTIVE +
    //    remove error tag.
    const remaining = await prisma.conversionAlert.count({
      where: {
        shopDomain: session.shop,
        productId: alert.productId,
        resolvedAt: null,
      },
    });
    if (remaining === 0) {
      // We need current tags to compute the new tag list. Fetch via the
      // existing Shopify client; could be optimized into a single mutation.
      const { getProductForProcessing } = await import("../lib/shopify/client");
      const product = await getProductForProcessing(admin, alert.productId);
      const newTags = applyTagDelta(product.tags, [], [SIZE_NORM_ERROR_TAG]);
      await updateProductStatusAndTags(admin, alert.productId, {
        status: "ACTIVE",
        tags: newTags,
      });
      await setMetafields(admin, [
        {
          ownerId: alert.productId,
          namespace: "size_norm",
          key: "conversion_status",
          type: "single_line_text_field",
          value: "partial_override",
        },
      ]);
    }

    return redirect("/app/alerts");
  }

  return { errors: { _form: ["Intent non riconosciuto"] } };
};

type ActionData = {
  errors?: Partial<Record<string, string[]>>;
};

export default function AlertDetail() {
  const { alert } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const errors = actionData?.errors;
  const isVariantAlert = alert.variantId !== null;

  return (
    <s-page heading="Dettaglio alert">
      <s-button slot="secondary-actions" href="/app/alerts">
        Torna alla lista
      </s-button>

      <s-section heading={alert.errorCode}>
        <s-paragraph>{alert.errorMessage}</s-paragraph>
        <s-paragraph>
          <s-text>Prodotto:</s-text> {alert.productId}
        </s-paragraph>
        {alert.variantId !== null && (
          <s-paragraph>
            <s-text>Variante:</s-text> {alert.variantId}
          </s-paragraph>
        )}
        <s-paragraph>
          <s-text>Creato:</s-text> {alert.createdAt}
        </s-paragraph>
        {alert.resolvedAt !== null && (
          <s-paragraph>
            <s-text>Risolto:</s-text> {alert.resolvedAt}{" "}
            {alert.resolvedBy !== null && `(${alert.resolvedBy})`}
          </s-paragraph>
        )}
        {alert.payload !== null &&
          typeof alert.payload === "object" &&
          Object.keys(alert.payload as Record<string, unknown>).length > 0 && (
            <s-paragraph>
              <s-text>Payload:</s-text>{" "}
              <s-text>{JSON.stringify(alert.payload, null, 2)}</s-text>
            </s-paragraph>
          )}
      </s-section>

      {alert.resolvedAt === null && (
        <>
          <s-section heading="Azioni rapide">
            <s-paragraph>
              Se hai corretto il prodotto su Shopify (es. aggiunto metafield
              mancante, rinominato variante), riprocessa per chiudere
              automaticamente l&apos;alert.
            </s-paragraph>
            <Form method="post">
              <input type="hidden" name="intent" value="reprocess" />
              <s-button type="submit" variant="primary">
                Riprocessa prodotto
              </s-button>
            </Form>
            <s-paragraph>
              Oppure se l&apos;errore non è risolvibile e vuoi solo silenziarlo:
            </s-paragraph>
            <Form method="post">
              <input type="hidden" name="intent" value="dismiss" />
              <s-button type="submit" variant="tertiary">
                Marca come risolto senza modifiche
              </s-button>
            </Form>
          </s-section>

          {isVariantAlert && (
            <s-section heading="Manual override variante">
              <s-paragraph>
                Forza i valori US/EU/UK/JP-mm su questa variante. Il metafield
                <s-text> size_norm.manual_override</s-text> sarà impostato a true
                e i webhook futuri rispetteranno i tuoi valori (non saranno
                sovrascritti dal processor automatico).
              </s-paragraph>
              {errors?._form !== undefined && (
                <s-banner tone="critical">
                  <s-text>{errors._form[0]}</s-text>
                </s-banner>
              )}
              <Form method="post">
                <input type="hidden" name="intent" value="override" />
                <s-stack direction="block" gap="base">
                  <s-text-field
                    name="sourceLabel"
                    label="Etichetta originale (es. 41½, M8/W9.5)"
                    error={errors?.sourceLabel?.[0]}
                  />
                  <s-stack direction="inline" gap="base">
                    <s-text-field
                      name="us"
                      label="US"
                      error={errors?.us?.[0]}
                    />
                    <s-text-field
                      name="eu"
                      label="EU"
                      error={errors?.eu?.[0]}
                    />
                    <s-text-field
                      name="uk"
                      label="UK"
                      error={errors?.uk?.[0]}
                    />
                    <s-text-field
                      name="jpMm"
                      label="JP-mm (intero)"
                      error={errors?.jpMm?.[0]}
                    />
                  </s-stack>
                  <s-button type="submit" variant="primary">
                    Applica override
                  </s-button>
                </s-stack>
              </Form>
            </s-section>
          )}
        </>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
