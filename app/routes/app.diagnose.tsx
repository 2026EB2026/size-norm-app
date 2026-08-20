import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  diagnoseProduct,
  parseProductIdInput,
  type DiagnoseResult,
} from "../lib/processor/diagnose";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const raw = url.searchParams.get("product")?.trim() ?? "";

  if (raw.length === 0) {
    return { raw, inputError: null, result: null as DiagnoseResult | null };
  }

  const numericId = parseProductIdInput(raw);
  if (numericId === null) {
    return {
      raw,
      inputError:
        "Non riesco a leggere un ID prodotto. Incolla l'URL della pagina prodotto, oppure il solo numero.",
      result: null as DiagnoseResult | null,
    };
  }

  const result = await diagnoseProduct(
    admin,
    prisma,
    session.shop,
    `gid://shopify/Product/${numericId}`,
  );

  return { raw, inputError: null, result };
};

const VERDICT: Record<
  string,
  { tone: "success" | "warning" | "critical" | "info"; label: string }
> = {
  ok: { tone: "success", label: "Conversione OK" },
  partial: { tone: "warning", label: "Conversione parziale" },
  blocked: { tone: "critical", label: "Conversione bloccata" },
  skipped: { tone: "info", label: "Prodotto ignorato" },
};

function Row(props: { label: string; children: React.ReactNode }) {
  return (
    <>
      <s-text color="subdued">{props.label}</s-text>
      <s-box>{props.children}</s-box>
    </>
  );
}

function Value(props: { value: string | null; empty?: string }) {
  if (props.value === null || props.value.length === 0) {
    return <s-text color="subdued">{props.empty ?? "— non impostato"}</s-text>;
  }
  return <s-text>{props.value}</s-text>;
}

export default function Diagnose() {
  const { raw, inputError, result } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const loading = navigation.state === "loading";

  return (
    <s-page heading="Diagnostica prodotto">
      <s-section heading="Analizza un prodotto">
        <s-paragraph color="subdued">
          Incolla l&apos;URL o l&apos;ID di un prodotto: l&apos;app mostra
          esattamente cosa vede e cosa decide il motore di conversione, passo
          per passo. Non modifica nulla.
        </s-paragraph>
        <Form method="get">
          <s-stack direction="inline" gap="base">
            <s-text-field
              name="product"
              label="Prodotto"
              placeholder="https://admin.shopify.com/store/…/products/123456 oppure 123456"
              defaultValue={raw}
              error={inputError ?? undefined}
            />
            <s-button type="submit" variant="primary" loading={loading}>
              Analizza
            </s-button>
          </s-stack>
        </Form>
      </s-section>

      {result !== null && result.found === false && (
        <s-section heading="Prodotto non trovato">
          <s-banner tone="critical">
            <s-text>{result.message}</s-text>
          </s-banner>
        </s-section>
      )}

      {result !== null && result.found === true && (
        <>
          <s-section heading="Esito">
            <s-stack direction="block" gap="base">
              <s-stack direction="inline" gap="small">
                <s-badge tone={VERDICT[result.verdict]?.tone ?? "info"}>
                  {VERDICT[result.verdict]?.label ?? result.verdict}
                </s-badge>
                <s-badge tone="neutral">
                  {`${result.variants.filter((v) => v.problem === null).length}/${result.variants.length} varianti convertite`}
                </s-badge>
                {result.stored !== null && (
                  <s-badge tone="neutral">{`Stato Shopify: ${result.stored.status}`}</s-badge>
                )}
              </s-stack>

              {result.blockers.length > 0 && (
                <s-banner heading="Da correggere" tone="critical">
                  <s-ordered-list>
                    {result.blockers.map((b, i) => (
                      <s-list-item key={i}>{b}</s-list-item>
                    ))}
                  </s-ordered-list>
                </s-banner>
              )}

              {result.notes.map((n, i) => (
                <s-banner key={i} tone="info">
                  <s-text>{n}</s-text>
                </s-banner>
              ))}
            </s-stack>
          </s-section>

          <s-section heading="1 · Dati del prodotto">
            <s-grid gridTemplateColumns="max-content 1fr" gap="small">
              <Row label="Titolo">
                <s-text>{result.product.title}</s-text>
              </Row>
              <Row label="Vendor (brand)">
                <Value
                  value={result.product.vendor}
                  empty="— mancante: serve per trovare la scala"
                />
              </Row>
              <Row label="Slug brand">
                <Value value={result.brandSlug} />
              </Row>
              <Row label="Tipo prodotto">
                <Value value={result.product.productType} />
              </Row>
              <Row label="Tag">
                <Value
                  value={
                    result.product.tags.length > 0
                      ? result.product.tags.join(", ")
                      : null
                  }
                  empty="— nessuno"
                />
              </Row>
            </s-grid>
          </s-section>

          <s-section heading="2 · È una calzatura?">
            <s-stack direction="block" gap="small">
              <s-stack direction="inline" gap="small">
                <s-badge tone={result.footwear.pass ? "success" : "critical"}>
                  {result.footwear.pass ? "Sì" : "No"}
                </s-badge>
                <s-badge
                  tone={result.footwear.viaProductType ? "success" : "neutral"}
                >
                  {`Tipo prodotto: ${result.footwear.viaProductType ? "riconosciuto" : "no"}`}
                </s-badge>
                <s-badge
                  tone={result.footwear.viaKeywords ? "success" : "neutral"}
                >
                  {`Parole chiave: ${result.footwear.viaKeywords ? "trovate" : "no"}`}
                </s-badge>
              </s-stack>
              {!result.footwear.pass && (
                <s-paragraph color="subdued">
                  Quando questo controllo non passa il prodotto viene ignorato
                  in silenzio: non compare nessun alert e nessun metafield
                  viene scritto.
                </s-paragraph>
              )}
            </s-stack>
          </s-section>

          <s-section heading="3 · Gender e categoria età">
            <s-grid gridTemplateColumns="max-content 1fr" gap="small">
              <Row label="Metafield gender">
                <Value value={result.metafields.gender} />
              </Row>
              <Row label="Dedotto dal testo">
                <Value value={result.gender.inferred} empty="— nessun indizio" />
              </Row>
              <Row label="Gender usato">
                {result.gender.effective === null ? (
                  <s-badge tone="critical">non determinato</s-badge>
                ) : (
                  <s-badge tone="success">
                    {result.gender.effective +
                      (result.gender.adoptedFromScale ? " (dalla scala)" : "")}
                  </s-badge>
                )}
              </Row>
              <Row label="Categoria età">
                <s-text>{result.age.effective}</s-text>
              </Row>
              <Row label="Metafield scale_sigla">
                <Value value={result.metafields.scaleSigla} />
              </Row>
            </s-grid>
          </s-section>

          <s-section heading="4 · Scala taglie">
            <s-stack direction="block" gap="base">
              {result.candidates.length === 0 ? (
                <s-paragraph color="subdued">
                  Nessuna sigla candidata: mancano brand e gender.
                </s-paragraph>
              ) : (
                <s-table>
                  <s-table-header-row>
                    <s-table-header listSlot="primary">
                      Sigla provata
                    </s-table-header>
                    <s-table-header>Esiste?</s-table-header>
                  </s-table-header-row>
                  <s-table-body>
                    {result.candidates.map((c) => (
                      <s-table-row key={c.sigla}>
                        <s-table-cell>
                          <s-text type="strong">{c.sigla}</s-text>
                        </s-table-cell>
                        <s-table-cell>
                          {c.found ? (
                            <s-badge tone="success">trovata</s-badge>
                          ) : (
                            <s-badge tone="neutral">no</s-badge>
                          )}
                        </s-table-cell>
                      </s-table-row>
                    ))}
                  </s-table-body>
                </s-table>
              )}

              {result.uniqueBrandFallback.attempted && (
                <s-paragraph color="subdued">
                  Fallback brand: {result.uniqueBrandFallback.poolSize} scale
                  trovate per questo brand
                  {result.uniqueBrandFallback.matched !== null
                    ? ` → usata ${result.uniqueBrandFallback.matched}`
                    : " → nessuna scelta possibile"}
                  .
                </s-paragraph>
              )}

              {result.resolvedScale !== null && (
                <s-grid gridTemplateColumns="max-content 1fr" gap="small">
                  <Row label="Scala usata">
                    <s-badge tone="success">
                      {result.resolvedScale.sigla}
                    </s-badge>
                  </Row>
                  <Row label="Nome">
                    <s-text>{result.resolvedScale.name}</s-text>
                  </Row>
                  <Row label="Gender / base">
                    <s-text>
                      {result.resolvedScale.gender} ·{" "}
                      {result.resolvedScale.sourceScale}
                    </s-text>
                  </Row>
                  <Row label="Etichette / alias">
                    <s-text>
                      {result.resolvedScale.labelsCount} ·{" "}
                      {result.resolvedScale.aliasesCount}
                    </s-text>
                  </Row>
                  <Row label="Conversion tables">
                    <s-text>
                      {result.tables.count} ({result.tables.totalMappings}{" "}
                      mappings)
                    </s-text>
                  </Row>
                </s-grid>
              )}
            </s-stack>
          </s-section>

          <s-section heading="5 · Varianti">
            {result.variants.length === 0 ? (
              <s-paragraph color="subdued">
                Il prodotto non ha varianti.
              </s-paragraph>
            ) : (
              <s-table>
                <s-table-header-row>
                  <s-table-header listSlot="primary">Variante</s-table-header>
                  <s-table-header>Taglia letta</s-table-header>
                  <s-table-header>Normalizzata</s-table-header>
                  <s-table-header>US / EU / UK / CM / JP</s-table-header>
                  <s-table-header>Salvata</s-table-header>
                  <s-table-header>Problema</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {result.variants.map((v) => (
                    <s-table-row key={v.id}>
                      <s-table-cell>{v.title}</s-table-cell>
                      <s-table-cell>
                        <Value value={v.rawLabel} empty="—" />
                      </s-table-cell>
                      <s-table-cell>
                        <Value value={v.canonical} empty="—" />
                      </s-table-cell>
                      <s-table-cell>
                        {v.matrix === null ? (
                          <s-text color="subdued">—</s-text>
                        ) : (
                          <s-text>
                            {[
                              v.matrix.us ?? "—",
                              v.matrix.eu ?? "—",
                              v.matrix.uk ?? "—",
                              v.matrix.cm ?? "—",
                              v.matrix.jpMm === null
                                ? "—"
                                : String(v.matrix.jpMm),
                            ].join(" / ")}
                          </s-text>
                        )}
                      </s-table-cell>
                      <s-table-cell>
                        {v.hasStoredMatrix ? (
                          <s-badge tone="success">sì</s-badge>
                        ) : (
                          <s-badge tone="neutral">no</s-badge>
                        )}
                      </s-table-cell>
                      <s-table-cell>
                        {v.problem === null ? (
                          <s-badge tone="success">OK</s-badge>
                        ) : (
                          <s-text>{v.problem}</s-text>
                        )}
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            )}
          </s-section>

          <s-section slot="aside" heading="Azioni">
            <s-stack direction="block" gap="base">
              <s-button
                href={`shopify:admin/products/${result.product.numericId}`}
                variant="secondary"
              >
                Apri prodotto in Shopify
              </s-button>
              <s-button href="/app/bulk" variant="secondary">
                Vai al Bulk re-scan
              </s-button>
              <s-paragraph color="subdued">
                Dopo aver corretto il prodotto lancia un re-scan (o modifica il
                prodotto) per riprocessarlo e scrivere i metafield.
              </s-paragraph>
            </s-stack>
          </s-section>

          {result.stored !== null && (
            <s-section slot="aside" heading="Stato salvato">
              <s-grid gridTemplateColumns="max-content 1fr" gap="small">
                <Row label="conversion_status">
                  <Value value={result.stored.conversionStatus} />
                </Row>
                <Row label="last_processed_at">
                  <Value
                    value={
                      result.stored.lastProcessedAt === null
                        ? null
                        : result.stored.lastProcessedAt
                            .replace("T", " ")
                            .slice(0, 19)
                    }
                    empty="— mai processato"
                  />
                </Row>
                <Row label="display_scale">
                  <Value value={result.stored.displayScale} empty="— default" />
                </Row>
              </s-grid>
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
