import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/** Brand-official scales follow `{brand}-{gender}-{age}`; everything else
 *  is a custom/Atelier scale created by the merchant or the legacy seed. */
function isBrandScale(sigla: string): boolean {
  return /-(men|women|unisex|kid)-/.test(sigla);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const gender = url.searchParams.get("gender")?.trim() ?? "";
  const type = url.searchParams.get("type")?.trim() ?? "";

  const all = await prisma.sizeScale.findMany({
    where: { shopDomain: session.shop },
    orderBy: [{ gender: "asc" }, { sigla: "asc" }],
  });

  const mapped = all.map((s) => ({
    id: s.id,
    sigla: s.sigla,
    name: s.name,
    gender: s.gender,
    sourceScale: s.sourceScale,
    labelsCount: Array.isArray(s.labels) ? s.labels.length : 0,
    isBrand: isBrandScale(s.sigla),
  }));

  const filtered = mapped.filter((s) => {
    if (
      q.length > 0 &&
      !s.sigla.toLowerCase().includes(q) &&
      !s.name.toLowerCase().includes(q)
    ) {
      return false;
    }
    if (gender.length > 0 && s.gender !== gender) return false;
    if (type === "brand" && !s.isBrand) return false;
    if (type === "custom" && s.isBrand) return false;
    return true;
  });

  return {
    q,
    gender,
    type,
    counts: {
      total: mapped.length,
      brand: mapped.filter((s) => s.isBrand).length,
      custom: mapped.filter((s) => !s.isBrand).length,
    },
    scales: filtered,
  };
};

const GENDER_LABEL: Record<string, string> = {
  MEN: "Uomo",
  WOMEN: "Donna",
  UNISEX: "Unisex",
  KID: "Bambino",
};

const SOURCE_SCALE_LABEL: Record<string, string> = {
  US: "US",
  EU: "EU",
  UK: "UK",
  JP_MM: "JP-mm",
  DOUBLE: "Double",
  MW_COMBINED: "M/W",
};

export default function ScalesIndex() {
  const { scales, counts, q, gender, type } = useLoaderData<typeof loader>();
  const filtersActive = q.length > 0 || gender.length > 0 || type.length > 0;

  return (
    <s-page heading="Scale Taglie">
      <s-button slot="primary-action" href="/app/scales/new" variant="primary">
        Nuova scala
      </s-button>

      <s-section heading="Catalogo scale">
        <s-stack direction="inline" gap="small">
          <s-badge tone="neutral">{`${counts.total} totali`}</s-badge>
          <s-badge tone="info">{`${counts.brand} brand-official`}</s-badge>
          <s-badge tone="success">{`${counts.custom} personalizzate`}</s-badge>
        </s-stack>
        <s-paragraph color="subdued">
          Le scale brand-official (es.{" "}
          <s-text type="strong">asics-women-adult</s-text>) vengono assegnate
          automaticamente da vendor + gender + age category. Le scale
          personalizzate si assegnano col metafield{" "}
          <s-text type="strong">size_norm.scale_sigla</s-text>.
        </s-paragraph>

        <form method="get">
          <s-stack direction="inline" gap="base">
            <s-text-field
              name="q"
              label="Cerca"
              placeholder="Sigla o nome…"
              defaultValue={q}
            />
            <s-select name="gender" label="Genere" value={gender}>
              <s-option value="">Tutti</s-option>
              <s-option value="MEN">Uomo</s-option>
              <s-option value="WOMEN">Donna</s-option>
              <s-option value="UNISEX">Unisex</s-option>
              <s-option value="KID">Bambino</s-option>
            </s-select>
            <s-select name="type" label="Tipo" value={type}>
              <s-option value="">Tutte</s-option>
              <s-option value="brand">Brand-official</s-option>
              <s-option value="custom">Personalizzate</s-option>
            </s-select>
            <s-button type="submit">Filtra</s-button>
            {filtersActive && (
              <s-button href="/app/scales" variant="tertiary">
                Reset
              </s-button>
            )}
          </s-stack>
        </form>
      </s-section>

      <s-section heading={`${scales.length} scale`}>
        {scales.length === 0 ? (
          <s-stack direction="block" gap="base">
            <s-paragraph color="subdued">
              Nessuna scala corrisponde ai filtri.
            </s-paragraph>
            {filtersActive && (
              <s-button href="/app/scales" variant="secondary">
                Mostra tutte
              </s-button>
            )}
          </s-stack>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Sigla</s-table-header>
              <s-table-header>Nome</s-table-header>
              <s-table-header>Tipo</s-table-header>
              <s-table-header>Genere</s-table-header>
              <s-table-header>Base</s-table-header>
              <s-table-header>Etichette</s-table-header>
              <s-table-header>Azioni</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {scales.map((s) => (
                <s-table-row key={s.id}>
                  <s-table-cell>
                    <s-text type="strong">{s.sigla}</s-text>
                  </s-table-cell>
                  <s-table-cell>{s.name}</s-table-cell>
                  <s-table-cell>
                    {s.isBrand ? (
                      <s-badge tone="info">Brand</s-badge>
                    ) : (
                      <s-badge tone="success">Custom</s-badge>
                    )}
                  </s-table-cell>
                  <s-table-cell>{GENDER_LABEL[s.gender] ?? s.gender}</s-table-cell>
                  <s-table-cell>
                    {SOURCE_SCALE_LABEL[s.sourceScale] ?? s.sourceScale}
                  </s-table-cell>
                  <s-table-cell>{s.labelsCount}</s-table-cell>
                  <s-table-cell>
                    <Link to={`/app/scales/${encodeURIComponent(s.sigla)}`}>
                      Modifica
                    </Link>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
