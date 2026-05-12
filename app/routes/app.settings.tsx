import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  parseMarketScales,
  settingsFormSchema,
} from "../lib/validators/settings";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });
  if (shop === null) {
    throw new Response("Shop record not found", { status: 500 });
  }

  return {
    settings: {
      globalDisplayMode: shop.globalDisplayMode,
      globalScale: shop.globalScale,
      fractionFormat: shop.fractionFormat,
      marketScalesJson:
        shop.marketScales !== null
          ? JSON.stringify(shop.marketScales, null, 2)
          : "",
    },
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

  await prisma.shop.update({
    where: { shopDomain: session.shop },
    data: {
      globalDisplayMode: parsed.data.globalDisplayMode,
      globalScale: parsed.data.globalScale,
      fractionFormat: parsed.data.fractionFormat,
      marketScales: marketScales as never,
    },
  });

  return { ok: true as const };
};

type ActionData = {
  errors?: Partial<Record<string, string[]>>;
  ok?: true;
};

export default function Settings() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const errors = actionData?.errors;

  return (
    <s-page heading="Settings">
      <s-section heading="Rendering PDP">
        <s-paragraph>
          Queste impostazioni vengono lette dalla Theme App Extension (M6) per
          decidere come renderizzare la tabella conversione sulla PDP.
        </s-paragraph>

        {actionData?.ok && (
          <s-banner tone="success">
            <s-text>Settings salvate.</s-text>
          </s-banner>
        )}

        <Form method="post">
          <s-stack direction="block" gap="base">
            <s-select
              name="globalDisplayMode"
              label="Display mode globale"
              value={settings.globalDisplayMode}
              error={errors?.globalDisplayMode?.[0]}
            >
              <s-option value="SINGLE_SCALE">A — Solo scala selezionata</s-option>
              <s-option value="FULL_TABLE">B — Tabella completa</s-option>
              <s-option value="MAIN_PLUS_TABLE">
                C — Scala principale + tabella espandibile
              </s-option>
            </s-select>
            <s-paragraph>
              <s-text>
                (A) Solo scala selezionata · (B) Tabella completa · (C) Scala
                principale + tabella espandibile
              </s-text>
            </s-paragraph>

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

            <s-text-area
              name="marketScalesJson"
              label="Override scala per market (JSON)"
              rows={6}
              defaultValue={settings.marketScalesJson}
              error={errors?.marketScalesJson?.[0]}
            />
            <s-paragraph>
              <s-text>
                Esempio: &#123;&quot;IT&quot;: &quot;EU&quot;, &quot;UK&quot;:
                &quot;UK&quot;, &quot;US&quot;: &quot;US&quot;, &quot;JP&quot;:
                &quot;JP_MM&quot;&#125;. Lascia vuoto per usare ovunque la scala
                globale.
              </s-text>
            </s-paragraph>

            <s-button type="submit" variant="primary">
              Salva
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
