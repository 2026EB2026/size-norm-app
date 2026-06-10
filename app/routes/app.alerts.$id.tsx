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
import { useSubmitting } from "../lib/ui/feedback";

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
 * Schema for the manual-override form. Conversion columns are accepted as
 * strings; jpMm is coerced to int. CM is optional (not all merchants have
 * the foot-length data at hand).
 */
const overrideSchema = z.object({
  us: z.string().trim().min(1, "US obbligatorio"),
  eu: z.string().trim().min(1, "EU obbligatorio"),
  uk: z.string().trim().min(1, "UK obbligatorio"),
  cm: z.string().trim().default(""),
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
      cm: formData.get("cm") ?? "",
      jpMm: formData.get("jpMm"),
      sourceLabel: formData.get("sourceLabel"),
    });
    if (parsed.success === false) {
      return { errors: parsed.error.flatten().fieldErrors };
    }
    const { us, eu, uk, cm, jpMm, sourceLabel } = parsed.data;
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
      ...(cm.length > 0
        ? [
            {
              ownerId: variantId,
              namespace: "size_norm",
              key: "cm",
              type: "single_line_text_field",
              value: cm,
            } satisfies MetafieldWrite,
          ]
        : []),
      {
        ownerId: variantId,
        namespace: "size_norm",
        key: "matrix",
        type: "json",
        value: JSON.stringify({
          us,
          eu,
          uk,
          cm: cm.length > 0 ? cm : null,
          jpMm,
        }),
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

const ERROR_CODE_LABEL: Record<string, string> = {
  MISSING_METAFIELD: "Metafield mancante",
  GENDER_MISMATCH: "Gender mismatch",
  LABEL_NOT_RECOGNIZED: "Etichetta non riconosciuta",
  TABLE_NOT_FOUND: "Tabella/scala non trovata",
  MAPPING_NOT_FOUND: "Mapping mancante",
  SCALE_OUT_OF_SCOPE_V1: "Scala fuori scope V1",
};

export default function AlertDetail() {
  const { alert } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const errors = actionData?.errors;
  const isVariantAlert = alert.variantId !== null;
  const reprocessing = useSubmitting("reprocess");
  const dismissing = useSubmitting("dismiss");
  const overriding = useSubmitting("override");

  const productNum = alert.productId.split("/").pop() ?? "";
  const variantNum = alert.variantId?.split("/").pop() ?? null;
  const hasPayload =
    alert.payload !== null &&
    typeof alert.payload === "object" &&
    Object.keys(alert.payload as Record<string, unknown>).length > 0;

  return (
    <s-page heading="Dettaglio alert">
      <s-button slot="secondary-actions" href="/app/alerts">
        Torna alla lista
      </s-button>

      <s-section heading="Diagnosi">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="small">
            <s-badge tone="critical">
              {ERROR_CODE_LABEL[alert.errorCode] ?? alert.errorCode}
            </s-badge>
            {alert.resolvedAt === null ? (
              <s-badge tone="warning">Aperto</s-badge>
            ) : (
              <s-badge tone="success">Risolto</s-badge>
            )}
          </s-stack>

          <s-paragraph>{alert.errorMessage}</s-paragraph>

          <s-grid gridTemplateColumns="max-content 1fr" gap="small">
            <s-text color="subdued">Prodotto</s-text>
            <s-link href={`shopify:admin/products/${productNum}`}>
              {productNum}
            </s-link>
            {variantNum !== null ? (
              <>
                <s-text color="subdued">Variante</s-text>
                <s-text>{variantNum}</s-text>
              </>
            ) : null}
            <s-text color="subdued">Creato</s-text>
            <s-text>{alert.createdAt.replace("T", " ").slice(0, 19)}</s-text>
            {alert.resolvedAt !== null ? (
              <>
                <s-text color="subdued">Risolto</s-text>
                <s-text>
                  {alert.resolvedAt.replace("T", " ").slice(0, 19)}
                  {alert.resolvedBy !== null ? ` (${alert.resolvedBy})` : ""}
                </s-text>
              </>
            ) : null}
          </s-grid>

          {hasPayload && (
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-text>{JSON.stringify(alert.payload, null, 2)}</s-text>
            </s-box>
          )}
        </s-stack>
      </s-section>

      {alert.resolvedAt === null && (
        <>
          <s-section heading="Risolvi">
            <s-grid
              gridTemplateColumns="repeat(auto-fit, minmax(240px, 1fr))"
              gap="base"
            >
              <s-box padding="base" border="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-heading>Riprocessa</s-heading>
                  <s-paragraph color="subdued">
                    Hai corretto il prodotto su Shopify (metafield aggiunto,
                    variante rinominata)? Riprocessa per chiudere
                    automaticamente l&apos;alert.
                  </s-paragraph>
                  <Form method="post">
                    <input type="hidden" name="intent" value="reprocess" />
                    <s-button
                      type="submit"
                      variant="primary"
                      loading={reprocessing}
                    >
                      Riprocessa prodotto
                    </s-button>
                  </Form>
                </s-stack>
              </s-box>

              <s-box padding="base" border="base" borderRadius="base">
                <s-stack direction="block" gap="base">
                  <s-heading>Silenzia</s-heading>
                  <s-paragraph color="subdued">
                    L&apos;errore non è risolvibile o non rilevante? Marca
                    l&apos;alert come risolto senza toccare il prodotto.
                  </s-paragraph>
                  <Form method="post">
                    <input type="hidden" name="intent" value="dismiss" />
                    <s-button type="submit" loading={dismissing}>
                      Marca come risolto
                    </s-button>
                  </Form>
                </s-stack>
              </s-box>
            </s-grid>
          </s-section>

          {isVariantAlert && (
            <s-section heading="Manual override variante">
              <s-paragraph color="subdued">
                Forza i valori di conversione su questa variante. Il metafield{" "}
                <s-text type="strong">size_norm.manual_override</s-text> sarà
                impostato a true e il processor automatico non sovrascriverà
                più i tuoi valori.
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
                    label="Etichetta originale"
                    placeholder="es. 41½, M8/W9.5"
                    error={errors?.sourceLabel?.[0]}
                  />
                  <s-grid
                    gridTemplateColumns="repeat(auto-fit, minmax(100px, 1fr))"
                    gap="base"
                  >
                    <s-text-field name="us" label="US" error={errors?.us?.[0]} />
                    <s-text-field name="eu" label="EU" error={errors?.eu?.[0]} />
                    <s-text-field name="uk" label="UK" error={errors?.uk?.[0]} />
                    <s-text-field
                      name="cm"
                      label="CM (opzionale)"
                      error={errors?.cm?.[0]}
                    />
                    <s-text-field
                      name="jpMm"
                      label="JP-mm (intero)"
                      placeholder="es. 250"
                      error={errors?.jpMm?.[0]}
                    />
                  </s-grid>
                  <s-box>
                    <s-button
                      type="submit"
                      variant="primary"
                      loading={overriding}
                    >
                      Applica override
                    </s-button>
                  </s-box>
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
