/**
 * Dumps the mappings of each scale missing CM, so we can build the
 * brand-cm-overrides file with exact source-label keys.
 *
 * Usage: npx tsx _scripts/dump-scale-mappings.ts [sigla1 sigla2 ...]
 * If no args: dumps all scales with zero cm coverage.
 */
import { BRAND_CONVERSION_TABLES_V1 } from "../app/lib/conversion/brand-scales-seed";

const target = new Set(process.argv.slice(2));
const dumpAll = target.size === 0;

for (const t of BRAND_CONVERSION_TABLES_V1) {
  const hasCm = t.mappings.some(
    (m) => m.cm !== null && m.cm !== undefined && String(m.cm).trim() !== "",
  );
  const shouldDump = dumpAll ? !hasCm : target.has(t.scaleSigla);
  if (!shouldDump) continue;

  // eslint-disable-next-line no-console
  console.log(`\n=== ${t.scaleSigla} (${t.mappings.length} mappings) ===`);
  for (const m of t.mappings) {
    // eslint-disable-next-line no-console
    console.log(
      `  src="${m.sourceLabel}"  eu=${m.eu ?? "—"}  us=${m.us ?? "—"}  uk=${m.uk ?? "—"}  cm=${m.cm ?? "—"}  jpMm=${m.jpMm ?? "—"}`,
    );
  }
}
