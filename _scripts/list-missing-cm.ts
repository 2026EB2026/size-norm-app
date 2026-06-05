/**
 * Lists brand scales that have zero CM data in the seed. Used to identify
 * which brand size charts still need to be sourced from official websites.
 *
 * Run: npx tsx _scripts/list-missing-cm.ts
 */
import {
  BRAND_CONVERSION_TABLES_V1,
  BRAND_SCALES_V1,
} from "../app/lib/conversion/brand-scales-seed";

const byScale = new Map<
  string,
  {
    total: number;
    withCm: number;
    withJp: number;
    brand: string | null;
    sample: Record<string, unknown> | null;
  }
>();
for (const t of BRAND_CONVERSION_TABLES_V1) {
  const total = t.mappings.length;
  const withCm = t.mappings.filter(
    (m) => m.cm !== null && m.cm !== undefined && String(m.cm).trim() !== "",
  ).length;
  const withJp = t.mappings.filter(
    (m) => m.jpMm !== null && m.jpMm !== undefined,
  ).length;
  byScale.set(t.scaleSigla, {
    total,
    withCm,
    withJp,
    brand: t.brand,
    sample:
      (t.mappings[Math.floor(t.mappings.length / 2)] as unknown as Record<
        string,
        unknown
      >) ?? null,
  });
}

const missing: {
  sigla: string;
  total: number;
  brand: string | null;
  withJp: number;
  sample: Record<string, unknown> | null;
}[] = [];
for (const [sigla, s] of byScale) {
  if (s.withCm === 0) {
    missing.push({
      sigla,
      total: s.total,
      brand: s.brand,
      withJp: s.withJp,
      sample: s.sample,
    });
  }
}

// eslint-disable-next-line no-console
console.log(
  `Scales with ZERO cm coverage: ${missing.length}/${byScale.size}\n`,
);

// Group by jp coverage so we can decide between derivation vs sourcing.
const derivable: typeof missing = [];
const needsSourcing: typeof missing = [];
for (const m of missing) {
  if (m.withJp >= m.total / 2) {
    derivable.push(m);
  } else {
    needsSourcing.push(m);
  }
}

// eslint-disable-next-line no-console
console.log(`Derivable from jpMm (CM = jpMm/10): ${derivable.length}`);
for (const m of derivable) {
  // eslint-disable-next-line no-console
  console.log(
    `  ${m.sigla} (${m.withJp}/${m.total} jp) — sample ${JSON.stringify(m.sample)}`,
  );
}

// eslint-disable-next-line no-console
console.log(
  `\nNeed sourcing from brand website (no jpMm): ${needsSourcing.length}`,
);
for (const m of needsSourcing) {
  // eslint-disable-next-line no-console
  console.log(
    `  ${m.sigla} (${m.total} rows) — sample ${JSON.stringify(m.sample)}`,
  );
}

// eslint-disable-next-line no-console
console.log(
  `\nTotal scales: ${BRAND_SCALES_V1.length}; total tables: ${BRAND_CONVERSION_TABLES_V1.length}`,
);
