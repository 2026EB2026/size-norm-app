/**
 * Previews the cross-scale alias enrichment for a sample brand scale.
 * Useful to sanity-check that EU/UK/CM values from the conversion table
 * become resolvable aliases pointing at the scale's sourceLabel.
 *
 * Run: npx tsx _scripts/preview-aliases.ts [scale-sigla]
 *   (default: asics-women-adult)
 */
import {
  BRAND_CONVERSION_TABLES_V1,
  BRAND_SCALES_V1,
} from "../app/lib/conversion";

const target = process.argv[2] ?? "asics-women-adult";

const scale = BRAND_SCALES_V1.find((s) => s.sigla === target);
const table = BRAND_CONVERSION_TABLES_V1.find((t) => t.scaleSigla === target);

if (scale === undefined || table === undefined) {
  // eslint-disable-next-line no-console
  console.error(`Scale or table not found: ${target}`);
  process.exit(1);
}

const tableMappings = table.mappings;

// Inline copy of enrichAliasesFromTable so this script doesn't reach into
// db/seed.ts (which imports prisma at module-load time).
function enrich(
  base: Record<string, string>,
  mappings: typeof tableMappings,
): Record<string, string> {
  const aliases: Record<string, string> = { ...base };
  const existing = new Set(Object.keys(aliases).map((k) => k.toLowerCase()));
  const add = (
    key: string | number | null | undefined,
    canonical: string,
  ): void => {
    if (key === null || key === undefined) return;
    const k = String(key).trim();
    if (k.length === 0 || k === canonical) return;
    const kLower = k.toLowerCase();
    if (existing.has(kLower)) return;
    aliases[k] = canonical;
    existing.add(kLower);
  };
  for (const m of mappings) {
    const c = m.sourceLabel;
    add(m.us, c);
    add(m.eu, c);
    add(m.uk, c);
    add(m.cm, c);
    add(m.jpMm, c);
    add(m.fr, c);
    add(m.jp, c);
    add(m.kr, c);
    add(m.usM, c);
    add(m.usW, c);
    add(m.euM, c);
    add(m.euW, c);
    add(m.ukM, c);
    add(m.ukW, c);
    add(m.cmM, c);
    add(m.cmW, c);
  }
  return aliases;
}

const enriched = enrich(scale.aliases, table.mappings);

// eslint-disable-next-line no-console
console.log(`\n=== ${target} (source ${scale.sourceScale}) ===`);
// eslint-disable-next-line no-console
console.log(`sourceLabels in scale.labels: ${scale.labels.join(", ")}`);
// eslint-disable-next-line no-console
console.log(`\nBefore enrichment: ${Object.keys(scale.aliases).length} aliases`);
// eslint-disable-next-line no-console
console.log(`After enrichment:  ${Object.keys(enriched).length} aliases`);
// eslint-disable-next-line no-console
console.log(
  `\nAdded ${Object.keys(enriched).length - Object.keys(scale.aliases).length} new aliases:`,
);
const added = Object.entries(enriched).filter(([k]) => !(k in scale.aliases));
for (const [alias, canonical] of added.slice(0, 50)) {
  // eslint-disable-next-line no-console
  console.log(`  "${alias}" → "${canonical}"`);
}
if (added.length > 50) {
  // eslint-disable-next-line no-console
  console.log(`  ... and ${added.length - 50} more`);
}
