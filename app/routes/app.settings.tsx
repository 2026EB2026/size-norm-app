import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { BRAND_SCALES_V1 } from "../lib/conversion";
import {
  parseBrandDisplayScales,
  parseMarketScales,
  settingsFormSchema,
} from "../lib/validators/settings";
import { useSaveToast, useSubmitting } from "../lib/ui/feedback";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  if (shop === null) {
    throw new Response("Shop record not found", { status: 500 });
  }

  // Collect the distinct brand slugs from BRAND_SCALES_V1 so the merchant
  // can see which brand keys our processor recognizes (sigla format is
  // `{brand-slug}-{gender}-{age}`; the slug is the first segment).
  const knownBrandSlugs = Array.from(
    new Set(
      BRAND_SCALES_V1.map((s) => s.sigla.split("-")[0]).filter(
        (s): s is string => typeof s === "string" && s.length > 0,
      ),
    ),
  ).sort();

  return {
    settings: {
      globalDisplayMode: shop.globalDisplayMode,
      globalScale: shop.globalScale,
      fractionFormat: shop.fractionFormat,
      marketScalesJson:
        shop.marketScales !== null
          ? JSON.stringify(shop.marketScales, null, 2)
          : "",
      brandDisplayScalesJson:
        shop.brandDisplayScales !== null
          ? JSON.stringify(shop.brandDisplayScales, null, 2)
          : "",
    },
    knownBrandSlugs,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const parsed = settingsFormSchema.safeParse({
    globalDisplayMode: formData.get("globalDisplayMode"),
    globalScale: formData.get("globalScale"),
    fractionFormat: formData.get("fractionFormat"),
    marketScalesJson: formData.get("marketScalesJson") ?? "",
    brandDisplayScalesJson: formData.get("brandDisplayScalesJson") ?? "",
  });
  if (parsed.success === false) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  let marketScales: Record<string, string> | null;
  try {
    marketScales = parseMarketScales(parsed.data.marketScalesJson);
  } catch (e) {
    return {
      errors: {
        marketScalesJson: [
          e instanceof Error ? e.message : "Errore parsing market scales",
        ],
      },
    };
  }

  let brandDisplayScales: Record<string, string> | null;
  try {
    brandDisplayScales = parseBrandDisplayScales(
      parsed.data.brandDisplayScalesJson,
    );
  } catch (e) {
    return {
      errors: {
        brandDisplayScalesJson: [
          e instanceof Error
            ? e.message
            : "Errore parsing brand display scales",
        ],
      },
    };
  }

  await prisma.shop.update({
    where: { shopDomain: session.shop },
    data: {
      globalDisplayMode: parsed.data.globalDisplayMode,
      globalScale: parsed.data.globalScale,
      fractionFormat: parsed.data.fractionFormat,
      marketScales: marketScales as never,
      brandDisplayScales: brandDisplayScales as never,
    },
  });

  return { ok: true as const };
};

type ActionData = {
  errors?: Partial<Record<string, string[]>>;
  ok?: true;
};

export default function Settings() {
  const { settings, knownBrandSlugs } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const errors = actionData?.errors;
  const saving = useSubmitting();

  useSaveToast(actionData?.ok, "Impostazioni salvate");

  return (
    <s-page heading="Impostazioni">
      <Form method="post">
        <s-section heading="Rendering PDP">
          <s-paragraph color="subdued">
            Come la tabella di conversione appare sulla pagina prodotto. Il
            display mode e la scala possono essere sovrascritti per singolo
            block dal theme editor.
          </s-paragraph>

          <s-stack direction="block" gap="base">
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-select
                name="globalDisplayMode"
                label="Display mode globale"
                value={settings.globalDisplayMode}
                error={errors?.globalDisplayMode?.[0]}
              >
                <s-option value="SINGLE_SCALE">
                  A — Solo scala selezionata
                </s-option>
                <s-option value="FULL_TABLE">B — Tabella completa</s-option>
                <s-option value="MAIN_PLUS_TABLE">
                  C — Scala principale + tabella espandibile
                </s-option>
              </s-select>

              <s-select
                name="globalScale"
                label="Scala globale"
                value={settings.globalScale}
                error={errors?.globalScale?.[0]}
              >
                <s-option value="EU">EU</s-option>
                <s-option value="US">US</s-option>
                <s-option value="UK">UK</s-option>
                <s-option value="JP_MM">JP mondopoint</s-option>
              </s-select>
            </s-grid>

            <s-select
              name="fractionFormat"
              label="Formato frazioni nel display"
              value={settings.fractionFormat}
              error={errors?.fractionFormat?.[0]}
            >
              <s-option value="UNICODE">Unicode (½)</s-option>
              <s-option value="DECIMAL">Decimale (.5)</s-option>
              <s-option value="ASCII">ASCII (1/2)</s-option>
            </s-select>
          </s-stack>
        </s-section>

        <s-section heading="Override per market">
          <s-paragraph color="subdued">
            Scala principale diversa per ogni market Shopify. I market non
            elencati usano la scala globale.
          </s-paragraph>
          <s-text-area
            name="marketScalesJson"
            label="Scala per market (JSON)"
            rows={5}
            defaultValue={settings.marketScalesJson}
            error={errors?.marketScalesJson?.[0]}
          />
          <s-paragraph color="subdued">
            Esempio: &#123;&quot;IT&quot;: &quot;EU&quot;, &quot;UK&quot;:
            &quot;UK&quot;, &quot;US&quot;: &quot;US&quot;, &quot;JP&quot;:
            &quot;JP_MM&quot;&#125;
          </s-paragraph>
        </s-section>

        <s-section heading="Override per brand">
          <s-paragraph color="subdued">
            Scala principale diversa per ogni brand. Le chiavi sono lo slug del
            vendor (minuscolo + trattini); valori ammessi: US, EU, UK, CM,
            JP_MM. I brand non elencati usano il default del block.
          </s-paragraph>
          <s-text-area
            name="brandDisplayScalesJson"
            label="Scala per brand (JSON)"
            rows={7}
            defaultValue={settings.brandDisplayScalesJson}
            error={errors?.brandDisplayScalesJson?.[0]}
          />
          <s-paragraph color="subdued">
            Esempio: &#123;&quot;asics&quot;: &quot;EU&quot;,
            &quot;vans&quot;: &quot;US&quot;, &quot;hoka&quot;:
            &quot;EU&quot;&#125;
          </s-paragraph>

          <s-box>
            <s-button type="submit" variant="primary" loading={saving}>
              Salva impostazioni
            </s-button>
          </s-box>
        </s-section>
      </Form>

      <s-section slot="aside" heading="Brand riconosciuti">
        <s-paragraph color="subdued">
          Slug dei brand con scale ufficiali precaricate, utilizzabili come
          chiavi nell&apos;override per brand:
        </s-paragraph>
        <s-stack direction="inline" gap="small">
          {knownBrandSlugs.map((slug) => (
            <s-badge key={slug} tone="neutral">
              {slug}
            </s-badge>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
