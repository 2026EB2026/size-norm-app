/**
 * Master conversion tables — the source of truth for US/EU/UK/JP-mm conversions
 * used to derive generic Conversion Tables in {@link conversion-tables-seed.ts}.
 *
 * Values are synthesized from:
 *   - Brannock device sizing chart (https://www.brannock.com — official US fitter)
 *   - ISO/TS 19407 mondopoint specification (foot length in mm)
 *   - BSI 5943 (UK shoe size standard)
 *   - Wikipedia "Shoe size" comparison chart
 *
 * Convention: each row is a unique "size point". Every column (us, eu, uk,
 * jpMm) is unique within the table, so reverse-lookup by any column is
 * deterministic.
 *
 * NOTE FOR THE MERCHANT: the seed uses a 1:1 Brannock-style mapping. Italian
 * retail conventions sometimes round differently (e.g. Italian tags often
 * print EU 41 ≈ US 8, while strict Brannock places EU 41 closer to US 9). The
 * merchant should validate the seed during M3 and create brand-specific
 * Conversion Tables in admin UI for any brand that deviates (e.g. Gucci runs
 * small, Adidas runs large).
 */

export interface MasterRow {
  us: string;
  eu: string;
  uk: string;
  jpMm: number;
}

/**
 * Men's adult footwear. Covers EU 36–48 (US 4–16). Each EU step is paired
 * with one US step and 2–3mm of mondopoint length.
 */
export const MEN_MASTER: MasterRow[] = [
  { us: "4", eu: "36", uk: "3", jpMm: 225 },
  { us: "4.5", eu: "36.5", uk: "3.5", jpMm: 228 },
  { us: "5", eu: "37", uk: "4", jpMm: 230 },
  { us: "5.5", eu: "37.5", uk: "4.5", jpMm: 233 },
  { us: "6", eu: "38", uk: "5", jpMm: 235 },
  { us: "6.5", eu: "38.5", uk: "5.5", jpMm: 238 },
  { us: "7", eu: "39", uk: "6", jpMm: 240 },
  { us: "7.5", eu: "39.5", uk: "6.5", jpMm: 243 },
  { us: "8", eu: "40", uk: "7", jpMm: 245 },
  { us: "8.5", eu: "40.5", uk: "7.5", jpMm: 248 },
  { us: "9", eu: "41", uk: "8", jpMm: 250 },
  { us: "9.5", eu: "41.5", uk: "8.5", jpMm: 253 },
  { us: "10", eu: "42", uk: "9", jpMm: 255 },
  { us: "10.5", eu: "42.5", uk: "9.5", jpMm: 258 },
  { us: "11", eu: "43", uk: "10", jpMm: 260 },
  { us: "11.5", eu: "43.5", uk: "10.5", jpMm: 263 },
  { us: "12", eu: "44", uk: "11", jpMm: 265 },
  { us: "12.5", eu: "44.5", uk: "11.5", jpMm: 268 },
  { us: "13", eu: "45", uk: "12", jpMm: 270 },
  { us: "13.5", eu: "45.5", uk: "12.5", jpMm: 273 },
  { us: "14", eu: "46", uk: "13", jpMm: 275 },
  { us: "14.5", eu: "46.5", uk: "13.5", jpMm: 278 },
  { us: "15", eu: "47", uk: "14", jpMm: 280 },
  { us: "15.5", eu: "47.5", uk: "14.5", jpMm: 283 },
  { us: "16", eu: "48", uk: "15", jpMm: 285 },
];

/**
 * Women's adult footwear. Covers EU 34–42 (US 3.5–11.5). Same physical-shoe
 * convention: a women's EU 38 shoe shares the mondopoint of a men's EU 38
 * shoe, but the US/UK labels differ by ~1.5 sizes (women's labels run higher
 * for the same physical foot length).
 */
export const WOMEN_MASTER: MasterRow[] = [
  { us: "3.5", eu: "34", uk: "1.5", jpMm: 215 },
  { us: "4", eu: "34.5", uk: "2", jpMm: 218 },
  { us: "4.5", eu: "35", uk: "2.5", jpMm: 220 },
  { us: "5", eu: "35.5", uk: "3", jpMm: 223 },
  { us: "5.5", eu: "36", uk: "3.5", jpMm: 225 },
  { us: "6", eu: "36.5", uk: "4", jpMm: 228 },
  { us: "6.5", eu: "37", uk: "4.5", jpMm: 230 },
  { us: "7", eu: "37.5", uk: "5", jpMm: 233 },
  { us: "7.5", eu: "38", uk: "5.5", jpMm: 235 },
  { us: "8", eu: "38.5", uk: "6", jpMm: 238 },
  { us: "8.5", eu: "39", uk: "6.5", jpMm: 240 },
  { us: "9", eu: "39.5", uk: "7", jpMm: 243 },
  { us: "9.5", eu: "40", uk: "7.5", jpMm: 245 },
  { us: "10", eu: "40.5", uk: "8", jpMm: 248 },
  { us: "10.5", eu: "41", uk: "8.5", jpMm: 250 },
  { us: "11", eu: "41.5", uk: "9", jpMm: 253 },
  { us: "11.5", eu: "42", uk: "9.5", jpMm: 255 },
];

/**
 * Kid footwear master table. Covers EU 15–34 (toddler through pre-teen).
 * For EU ≥ 35 the scale resolves to {@link WOMEN_MASTER}.
 */
export const KID_MASTER: MasterRow[] = [
  { us: "0", eu: "15", uk: "0", jpMm: 95 },
  { us: "1", eu: "16", uk: "0.5", jpMm: 100 },
  { us: "1.5", eu: "17", uk: "1", jpMm: 105 },
  { us: "2", eu: "17.5", uk: "1.5", jpMm: 110 },
  { us: "2.5", eu: "18", uk: "2", jpMm: 115 },
  { us: "3", eu: "18.5", uk: "2.5", jpMm: 120 },
  { us: "3.5", eu: "19", uk: "3", jpMm: 125 },
  { us: "4", eu: "20", uk: "3.5", jpMm: 130 },
  { us: "4.5", eu: "20.5", uk: "4", jpMm: 132 },
  { us: "5", eu: "21", uk: "4.5", jpMm: 135 },
  { us: "5.5", eu: "21.5", uk: "5", jpMm: 138 },
  { us: "6", eu: "22", uk: "5.5", jpMm: 140 },
  { us: "6.5", eu: "22.5", uk: "6", jpMm: 142 },
  { us: "7", eu: "23", uk: "6.5", jpMm: 145 },
  { us: "7.5", eu: "23.5", uk: "7", jpMm: 148 },
  { us: "8", eu: "24", uk: "7.5", jpMm: 150 },
  { us: "8.5", eu: "24.5", uk: "8", jpMm: 153 },
  { us: "9", eu: "25", uk: "8.5", jpMm: 155 },
  { us: "9.5", eu: "25.5", uk: "9", jpMm: 158 },
  { us: "10", eu: "26", uk: "9.5", jpMm: 160 },
  { us: "10.5", eu: "26.5", uk: "10", jpMm: 163 },
  { us: "11", eu: "27", uk: "10.5", jpMm: 165 },
  { us: "11.5", eu: "27.5", uk: "11", jpMm: 168 },
  { us: "12", eu: "28", uk: "11.5", jpMm: 170 },
  { us: "12.5", eu: "28.5", uk: "12", jpMm: 173 },
  { us: "13", eu: "29", uk: "12.5", jpMm: 175 },
  { us: "13.5", eu: "30", uk: "13", jpMm: 180 },
  { us: "1Y", eu: "31", uk: "13.5", jpMm: 190 },
  { us: "1.5Y", eu: "32", uk: "1Y", jpMm: 195 },
  { us: "2Y", eu: "33", uk: "1.5Y", jpMm: 200 },
  { us: "2.5Y", eu: "33.5", uk: "2Y", jpMm: 205 },
  { us: "3Y", eu: "34", uk: "2.5Y", jpMm: 210 },
];

/**
 * Finds the first row in the master table where the given column matches the
 * given target. Returns `null` if no row matches.
 *
 * Because every column in MEN_MASTER/WOMEN_MASTER is unique, the "first
 * match" detail is informational only — there can be at most one match.
 */
export function findRowByColumn(
  table: MasterRow[],
  column: keyof MasterRow,
  target: string | number,
): MasterRow | null {
  const targetStr = String(target);
  for (const row of table) {
    if (String(row[column]) === targetStr) return row;
  }
  return null;
}
