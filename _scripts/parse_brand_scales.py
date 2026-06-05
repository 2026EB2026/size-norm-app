"""
Parse CONVERSIONE TAGLIE.xlsx into our SizeScale + ConversionTable seed format.

Strategy per AGE category:
  - ADULT block (cols 3-15): detect M/W presence in cols 10/11 (US W/M).
    If both → split into women + men scales.
    Source EU: col 4 (EU W) or 5 (EU M) if present, else col 3 (EU).
  - UNISEX SIZING M/W combined blocks (cols 31-45): 3 variants for Hoka-style
    brands. Each is its own unisex scale.
  - Kid category blocks at cols 46+: each is its own kid scale.

Outputs:
  _scripts/brand-scales-raw.json — full structured dump
  app/lib/conversion/brand-scales-seed.ts — TS file to import in the seed
"""
import pandas as pd
import json
import re
import os
import sys
from collections import defaultdict

XLSX = r"C:/Users/customers1/Downloads/CONVERSIONE TAGLIE.xlsx"
OUT_DIR = r"C:/Users/customers1/Desktop/size-norm-app/_scripts"
TS_OUT = r"C:/Users/customers1/Desktop/size-norm-app/app/lib/conversion/brand-scales-seed.ts"

sys.stdout.reconfigure(encoding="utf-8")

df = pd.read_excel(XLSX, sheet_name="Foglio1", header=None)

# Brands to exclude (non-footwear)
EXCLUDE_BRANDS = {"KANGOL"}  # Hat brand


def slugify(name):
    s = name.lower().strip()
    # Remove redundant "kids" suffix from brand-slug — the age category
    # already captures kid-ness
    s = re.sub(r"\s+kids$", "", s, flags=re.IGNORECASE)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def fmt_decimal(v):
    """Render numeric value with sane precision: round to .5 increments where
    possible, keep originals like 22.4 cm intact, convert thirds to ⅓/⅔."""
    if v is None:
        return None
    try:
        f = float(v)
    except (ValueError, TypeError):
        return str(v).strip()
    # Round to nearest .5? No — many legit values like 22.4 cm should stay
    # as-is. Just trim insignificant decimals.
    # Detect "third" patterns: 35.33333 → 35⅓, 35.66666 → 35⅔
    whole = int(f)
    frac = round(f - whole, 4)
    if abs(frac - 0.3333) < 0.01:
        return f"{whole}⅓"
    if abs(frac - 0.6667) < 0.01:
        return f"{whole}⅔"
    if frac == 0:
        return str(whole)
    # Strip trailing zeros, max 2 decimal places
    s = f"{f:.2f}".rstrip("0").rstrip(".")
    return s


def normalize_value(v):
    if pd.isna(v):
        return None
    if isinstance(v, (int, float)):
        return fmt_decimal(v)
    return str(v).strip()


def col_filled(block, col):
    return block[col].notna().any()


def build_mapping(row, col_map, source_col, source_scale):
    source_label = normalize_value(row[source_col])
    if source_label is None:
        return None
    m = {"sourceLabel": source_label}
    if source_scale == "MW_COMBINED":
        m["us"] = source_label
    for k, col_idx in col_map.items():
        if col_idx == source_col:
            continue
        v = normalize_value(row[col_idx])
        if v is not None:
            m[k] = v
    # For MW_COMBINED, derive canonical `eu` and `uk` from the men's side
    # if the split fields are present. This keeps the canonical 4-col matrix
    # populated; the women's side is still available via euW/ukW for the PDP.
    if source_scale == "MW_COMBINED":
        if "eu" not in m and "eu_m" in m:
            m["eu"] = m["eu_m"]
        if "uk" not in m and "uk_m" in m:
            m["uk"] = m["uk_m"]
    return m


def build_scale(brand, gender, age, mode, source_scale, brand_block,
                source_col, col_map, valid_filter_col=None):
    if valid_filter_col is None:
        valid_filter_col = source_col
    valid_rows = brand_block[brand_block[valid_filter_col].notna()]
    if len(valid_rows) == 0:
        return None

    labels = []
    mappings = []
    for _, row in valid_rows.iterrows():
        label = normalize_value(row[source_col])
        if label is None:
            continue
        labels.append(label)
        m = build_mapping(row, col_map, source_col, source_scale)
        if m is not None:
            mappings.append(m)

    if not labels:
        return None

    parts = [slugify(brand), gender, age]
    if mode != "simple":
        parts.append(mode)
    sigla = "-".join(parts)

    return {
        "sigla": sigla,
        "name": f"{brand} — {gender} {age}" + (f" ({mode})" if mode != "simple" else ""),
        "brand": brand,
        "gender": gender,
        "age": age,
        "sourceScale": source_scale,
        "mode": mode,
        "labels": labels,
        "mappings": mappings,
    }


def process_brand(brand, brand_block):
    out = []

    has_us_w = col_filled(brand_block, 10)
    has_us_m = col_filled(brand_block, 11)
    has_us_uni = col_filled(brand_block, 12)
    has_eu = col_filled(brand_block, 3)
    has_eu_w = col_filled(brand_block, 4)
    has_eu_m = col_filled(brand_block, 5)

    # ADULT block — smart M/W split
    if has_us_w and has_us_m:
        # Determine source EU col for each gender
        eu_w_src = 4 if has_eu_w else 3
        eu_m_src = 5 if has_eu_m else 3
        out.append(build_scale(
            brand, "women", "adult", "simple", "EU", brand_block,
            source_col=eu_w_src,
            col_map={"us": 10, "uk": 8, "cm": 26, "jp": 15, "fr": 6},
            valid_filter_col=10,
        ))
        out.append(build_scale(
            brand, "men", "adult", "simple", "EU", brand_block,
            source_col=eu_m_src,
            col_map={"us": 11, "uk": 9, "cm": 27, "jp": 14, "fr": 6},
            valid_filter_col=11,
        ))
    elif has_us_w or has_eu_w:
        out.append(build_scale(
            brand, "women", "adult", "simple", "EU", brand_block,
            source_col=4 if has_eu_w else 3,
            col_map={"us": 10, "uk": 8, "cm": 26, "jp": 15, "fr": 6},
        ))
    elif has_us_m or has_eu_m:
        out.append(build_scale(
            brand, "men", "adult", "simple", "EU", brand_block,
            source_col=5 if has_eu_m else 3,
            col_map={"us": 11, "uk": 9, "cm": 27, "jp": 14, "fr": 6},
        ))
    elif has_us_uni or has_eu:
        out.append(build_scale(
            brand, "unisex", "adult", "simple", "EU", brand_block,
            source_col=3 if has_eu else 12,
            col_map={"us": 12, "uk": 7, "cm": 28, "jp": 13, "fr": 6},
        ))

    # Ferragamo-specific cols
    has_ferr_w = col_filled(brand_block, 29)
    has_ferr_m = col_filled(brand_block, 30)
    if has_ferr_w:
        out.append(build_scale(
            brand, "women", "adult", "ferragamo", "US", brand_block,
            source_col=29,
            col_map={"eu": 3, "uk": 8, "us": 10, "cm": 26},
        ))
    if has_ferr_m:
        out.append(build_scale(
            brand, "men", "adult", "ferragamo", "US", brand_block,
            source_col=30,
            col_map={"eu": 3, "uk": 9, "us": 11, "cm": 27},
        ))

    # UNISEX SIZING M/W combined variants
    if col_filled(brand_block, 31):
        out.append(build_scale(
            brand, "unisex", "adult", "mw-v1", "MW_COMBINED", brand_block,
            source_col=31,
            col_map={"uk": 32, "eu": 33},
        ))
    if col_filled(brand_block, 35):
        out.append(build_scale(
            brand, "unisex", "adult", "mw-v2", "MW_COMBINED", brand_block,
            source_col=35,
            col_map={"uk_m": 36, "eu_m": 37, "uk_w": 38, "eu_w": 39, "cm": 34},
        ))
    if col_filled(brand_block, 41):
        out.append(build_scale(
            brand, "unisex", "adult", "mw-v3", "MW_COMBINED", brand_block,
            source_col=41,
            col_map={"uk_m": 42, "eu_m": 43, "uk_w": 44, "eu_w": 45, "cm": 40},
        ))

    # Kid category blocks
    kid_blocks = [
        ("crib",         {"us": 46, "uk": 47, "jp": 48, "kr": 49, "cm": 50, "eu": 51}),
        ("infant",       {"us": 52, "uk": 53, "jp": 54, "kr": 55, "cm": 56, "eu": 57}),
        ("pre-school",   {"us": 58, "uk": 59, "jp": 60, "kr": 61, "cm": 62, "eu": 63}),
        ("youth",        {"us": 64, "uk": 65, "jp": 66, "kr": 67, "cm": 68, "eu": 69}),
        ("grade-school", {"us": 70, "eu": 71}),
        ("junior",       {"us": 72, "eu": 73}),
        ("toddler",      {"us": 74, "eu": 75}),
        ("big-kids",     {"us": 76, "eu": 77}),
    ]
    for age, col_map in kid_blocks:
        us_col = col_map["us"]
        if not col_filled(brand_block, us_col):
            continue
        out.append(build_scale(
            brand, "kid", age, "simple", "US", brand_block,
            source_col=us_col,
            col_map={k: v for k, v in col_map.items() if k != "us"},
        ))

    return [s for s in out if s is not None]


# Find brand row ranges
brand_rows = df[df[2].notna() & (df[2] != "BRAND")].index.tolist()
brand_row_ranges = []
for i, start in enumerate(brand_rows):
    end = brand_rows[i + 1] if i + 1 < len(brand_rows) else len(df)
    brand_row_ranges.append((df.iloc[start, 2], start, end))

print(f"Brands detected: {len(brand_row_ranges)}\n")

all_scales = []
gen_count_per_brand = defaultdict(int)
stats = defaultdict(int)

for brand, start, end in brand_row_ranges:
    if brand in EXCLUDE_BRANDS:
        continue
    block = df.iloc[start:end]
    scales = process_brand(brand, block)
    all_scales.extend(scales)
    gen_count_per_brand[brand] = len(scales)
    for s in scales:
        stats[f"{s['age']}/{s['gender']}{('/' + s['mode']) if s['mode'] != 'simple' else ''}"] += 1

# Output JSON
os.makedirs(OUT_DIR, exist_ok=True)
with open(os.path.join(OUT_DIR, "brand-scales-raw.json"), "w", encoding="utf-8") as f:
    json.dump(all_scales, f, indent=2, ensure_ascii=False)

# ── Generate TS seed file ──────────────────────────────────────────────
ts_lines = [
    "// AUTO-GENERATED by _scripts/parse_brand_scales.py — DO NOT EDIT MANUALLY",
    "// Source: CONVERSIONE TAGLIE.xlsx (provided by merchant on 2026-06-05)",
    "//",
    "// To regenerate, run:",
    "//   python _scripts/parse_brand_scales.py",
    "",
    'import type { ConversionTable, SizeScale } from "./types";',
    "",
    "/**",
    " * Brand-official size scales for ~60 footwear brands carried by Eleonora",
    f" * Bonucci. Generated from {len(all_scales)} entries in the merchant's master",
    " * conversion spreadsheet.",
    " *",
    " * Naming convention: `{brand-slug}-{gender}-{age-category}[-{mode}]`",
    " *   - brand-slug: lowercase, dashes, e.g. \"asics\", \"dr-martens\", \"hoka\"",
    " *   - gender: \"men\" | \"women\" | \"unisex\" | \"kid\"",
    " *   - age-category: \"adult\" | \"crib\" | \"infant\" | \"toddler\" | \"pre-school\"",
    " *                   | \"youth\" | \"grade-school\" | \"junior\" | \"big-kids\"",
    " *   - mode (optional): \"ferragamo\" for FERRAGAMO-specific US sizing;",
    " *                       \"mw-v1\" | \"mw-v2\" | \"mw-v3\" for M/W combined unisex",
    " *                       (e.g. Hoka double-sizing) — these use US source labels",
    " *                       in the form `04/05` or similar compound notation.",
    " */",
    "export const BRAND_SCALES_V1: readonly SizeScale[] = [",
]

def ts_string(s):
    """JSON-encode a string for TS (handles unicode safely)."""
    return json.dumps(s, ensure_ascii=False)

for s in all_scales:
    ts_lines.append("  {")
    ts_lines.append(f"    sigla: {ts_string(s['sigla'])},")
    ts_lines.append(f"    name: {ts_string(s['name'])},")
    ts_lines.append(f"    gender: {ts_string(s['gender'])} as const,")
    ts_lines.append(f"    sourceScale: {ts_string(s['sourceScale'])} as const,")
    labels_str = ", ".join(ts_string(l) for l in s["labels"])
    ts_lines.append(f"    labels: [{labels_str}],")
    ts_lines.append("    aliases: {},")
    ts_lines.append("  },")
ts_lines.append("] as const;")
ts_lines.append("")
ts_lines.append("/**")
ts_lines.append(" * Generic ConversionTables for the brand scales above.")
ts_lines.append(" * Each scale has exactly one generic table; brand-specific overrides")
ts_lines.append(" * (the M3 brand-specific table feature) are NOT used here because the")
ts_lines.append(" * scale IS already brand-specific. If a merchant wants to override a")
ts_lines.append(" * single brand's chart, they edit the generic table for that scale.")
ts_lines.append(" */")
ts_lines.append("export const BRAND_CONVERSION_TABLES_V1: readonly ConversionTable[] = [")
for s in all_scales:
    ts_lines.append("  {")
    ts_lines.append(f"    scaleSigla: {ts_string(s['sigla'])},")
    ts_lines.append("    brand: null,")
    ts_lines.append("    isSeed: true,")
    ts_lines.append("    mappings: [")
    for m in s["mappings"]:
        kv = []
        kv.append(f"sourceLabel: {ts_string(m['sourceLabel'])}")
        # Canonical 4 fields — ALWAYS emit (null when not present)
        for k_canon in ["us", "eu", "uk"]:
            if k_canon in m:
                kv.append(f"{k_canon}: {ts_string(m[k_canon])}")
            else:
                kv.append(f"{k_canon}: null")
        # jpMm: derive from "cm" * 10 if numeric, else null
        jpmm = None
        if "cm" in m:
            try:
                # cm may contain "/" for ranges or "1/2" for fractions —
                # only convert plain numeric values to mm
                cm_val = m["cm"].replace(",", ".")
                if "/" not in cm_val:
                    jpmm = int(round(float(cm_val) * 10))
            except (ValueError, AttributeError):
                jpmm = None
        kv.append(f"jpMm: {jpmm if jpmm is not None else 'null'}")
        # Extended optional fields
        for k in ["fr", "cm", "jp", "kr", "us_m", "us_w", "uk_m", "uk_w", "eu_m", "eu_w", "cm_m", "cm_w"]:
            if k in m:
                ts_key = k if "_" not in k else k.replace("_w", "W").replace("_m", "M")
                kv.append(f"{ts_key}: {ts_string(m[k])}")
        ts_lines.append("      { " + ", ".join(kv) + " },")
    ts_lines.append("    ],")
    ts_lines.append("  },")
ts_lines.append("] as const;")
ts_lines.append("")

os.makedirs(os.path.dirname(TS_OUT), exist_ok=True)
with open(TS_OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(ts_lines))

# Summary
print(f"Total scales generated: {len(all_scales)}\n")
print("Stats by age/gender/mode:")
for k, v in sorted(stats.items(), key=lambda x: -x[1]):
    print(f"  {k:35s} → {v} scales")
print()

zero_brands = [b for b, _, _ in brand_row_ranges
               if b not in EXCLUDE_BRANDS and gen_count_per_brand.get(b, 0) == 0]
if zero_brands:
    print(f"Brands with ZERO scales (need manual review): {zero_brands}")
else:
    print("All in-scope brands have at least one scale ✓")
print()

print(f"TS seed file written: {TS_OUT}")
print(f"   {os.path.getsize(TS_OUT)} bytes")
