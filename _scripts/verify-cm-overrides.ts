/**
 * Smoke-tests the hand-sourced CM overrides against the seed tables:
 * for every (sigla, sourceLabel) in BRAND_CM_OVERRIDES_V1, verify that
 * the seed actually has a mapping with that sourceLabel — otherwise
 * the override is a typo and will be silently ignored at runtime.
 *
 * Also reports per-scale coverage (overridden / total mappings).
 *
 * Run: npx tsx _scripts/verify-cm-overrides.ts
 */
import {
  BRAND_CM_OVERRIDES_V1,
  BRAND_CONVERSION_TABLES_V1,
} from "../app/lib/conversion";

let mismatches = 0;
let totalOverrides = 0;

for (const [sigla, byLabel] of Object.entries(BRAND_CM_OVERRIDES_V1)) {
  const table = BRAND_CONVERSION_TABLES_V1.find((t) => t.scaleSigla === sigla);
  if (table === undefined) {
    // eslint-disable-next-line no-console
    console.warn(`[!] ${sigla}: no seed table found`);
    mismatches++;
    continue;
  }
  const seedLabels = new Set(table.mappings.map((m) => m.sourceLabel));
  const overrideLabels = Object.keys(byLabel);
  const orphans = overrideLabels.filter((l) => !seedLabels.has(l));
  // Count mappings (not unique labels) that will actually receive an
  // override after the merge — duplicate rows in the seed also get
  // covered as long as their sourceLabel is in the override map.
  const overriddenMappings = table.mappings.filter((m) =>
    Object.prototype.hasOwnProperty.call(byLabel, m.sourceLabel),
  ).length;
  totalOverrides += overrideLabels.length;
  if (orphans.length > 0) {
    mismatches += orphans.length;
    // eslint-disable-next-line no-console
    console.warn(
      `[!] ${sigla}: ${orphans.length} orphan override(s): ${orphans.join(", ")}`,
    );
  }
  // eslint-disable-next-line no-console
  console.log(
    `${sigla}: ${overriddenMappings}/${table.mappings.length} mappings covered (${overrideLabels.length} override entries)`,
  );
}

// eslint-disable-next-line no-console
console.log(
  `\n${totalOverrides} override entries; ${mismatches} mismatches.`,
);
if (mismatches > 0) {
  process.exitCode = 1;
}
