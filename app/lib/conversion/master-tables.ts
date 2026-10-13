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
 * THE UK AND US COLUMNS FOLLOW THE ITALIAN RETAIL CONVENTION, NOT BRANNOCK.
 * Every one of the 27 official brand guides collected in October 2026 agrees
 * on the same two offsets, and all of them disagreed with the Brannock values
 * this table used to carry:
 *
 *   women   uk = eu - 33   us = eu - 30     (IT 35 = UK 2 = US 5)
 *   men     uk = eu - 34   us = eu - 33     (IT 39 = UK 5 = US 6)
 *
 * Brannock put men's IT 39 at UK 6 / US 7 — a full size out — and women's
 * IT 35 at UK 2.5 / US 4.5. On a catalogue of Italian-labelled shoes that is
 * the wrong answer on every product without a brand-specific table.
 * See _scripts/guide-trascritte.json for the guides this was derived from.
 *
 * `eu` and `jpMm` are deliberately UNCHANGED. The brand guides do not agree
 * with each other on centimetres — some publish mondopoint foot length, some
 * publish insole length, and a few publish both in the same table — so there
 * is no consensus to import. The Brannock mondopoint values at least stay
 * consistent between the men's and women's tables.
 *
 * A brand that still deviates (Gucci men runs US = UK + 0.5, adidas runs on
 * thirds of a EU size) is covered by its own table in
 * {@link brand-official-tables.ts}, which lookupConversion prefers.
 */

export interface MasterRow {
  us: string;
  eu: string;
  uk: string;
  jpMm: number;
}

/**
 * Men's adult footwear. Covers EU 35–48 (US 2–15). Each EU step is paired
 * with one US step and 2–3mm of mondopoint length.
 */
export const MEN_MASTER: MasterRow[] = [
  // EU 35 exists only to cover the unisex scale `AM`, which starts a size
  // below the men's one. Without it `AM` label "35" derives an empty matrix.
  { us: "2", eu: "35", uk: "1", jpMm: 222 },
  { us: "2.5", eu: "35.5", uk: "1.5", jpMm: 224 },
  { us: "3", eu: "36", uk: "2", jpMm: 225 },
  { us: "3.5", eu: "36.5", uk: "2.5", jpMm: 228 },
  { us: "4", eu: "37", uk: "3", jpMm: 230 },
  { us: "4.5", eu: "37.5", uk: "3.5", jpMm: 233 },
  { us: "5", eu: "38", uk: "4", jpMm: 235 },
  { us: "5.5", eu: "38.5", uk: "4.5", jpMm: 238 },
  { us: "6", eu: "39", uk: "5", jpMm: 240 },
  { us: "6.5", eu: "39.5", uk: "5.5", jpMm: 243 },
  { us: "7", eu: "40", uk: "6", jpMm: 245 },
  { us: "7.5", eu: "40.5", uk: "6.5", jpMm: 248 },
  { us: "8", eu: "41", uk: "7", jpMm: 250 },
  { us: "8.5", eu: "41.5", uk: "7.5", jpMm: 253 },
  { us: "9", eu: "42", uk: "8", jpMm: 255 },
  { us: "9.5", eu: "42.5", uk: "8.5", jpMm: 258 },
  { us: "10", eu: "43", uk: "9", jpMm: 260 },
  { us: "10.5", eu: "43.5", uk: "9.5", jpMm: 263 },
  { us: "11", eu: "44", uk: "10", jpMm: 265 },
  { us: "11.5", eu: "44.5", uk: "10.5", jpMm: 268 },
  { us: "12", eu: "45", uk: "11", jpMm: 270 },
  { us: "12.5", eu: "45.5", uk: "11.5", jpMm: 273 },
  { us: "13", eu: "46", uk: "12", jpMm: 275 },
  { us: "13.5", eu: "46.5", uk: "12.5", jpMm: 278 },
  { us: "14", eu: "47", uk: "13", jpMm: 280 },
  { us: "14.5", eu: "47.5", uk: "13.5", jpMm: 283 },
  { us: "15", eu: "48", uk: "14", jpMm: 285 },
  // The tail below exists for two scales that run past EU 48: `AQ` (Scarpe
  // Uomo TF), whose last labels are US 15½ and 16, and `SJ` (Scarpe uomo JP),
  // whose last labels are 29, 29.5 and 30 cm. Without these rows those
  // labels derive an empty matrix.
  { us: "15.5", eu: "48.5", uk: "14.5", jpMm: 288 },
  { us: "16", eu: "49", uk: "15", jpMm: 290 },
  { us: "16.5", eu: "49.5", uk: "15.5", jpMm: 293 },
  { us: "17", eu: "50", uk: "16", jpMm: 295 },
  { us: "17.5", eu: "50.5", uk: "16.5", jpMm: 298 },
  { us: "18", eu: "51", uk: "17", jpMm: 300 },
];

/**
 * Women's adult footwear. Covers EU 34–42 (US 3.5–11.5). Same physical-shoe
 * convention: a women's EU 38 shoe shares the mondopoint of a men's EU 38
 * shoe, but the US/UK labels differ by ~1.5 sizes (women's labels run higher
 * for the same physical foot length).
 */
export const WOMEN_MASTER: MasterRow[] = [
  // US 3.5 exists only to cover the `R` scale (Scarpe Donna USA), whose
  // first label is 3½. Without it that label derives an empty matrix.
  { us: "3.5", eu: "33.5", uk: "0.5", jpMm: 212 },
  { us: "4", eu: "34", uk: "1", jpMm: 215 },
  { us: "4.5", eu: "34.5", uk: "1.5", jpMm: 218 },
  { us: "5", eu: "35", uk: "2", jpMm: 220 },
  { us: "5.5", eu: "35.5", uk: "2.5", jpMm: 223 },
  { us: "6", eu: "36", uk: "3", jpMm: 225 },
  { us: "6.5", eu: "36.5", uk: "3.5", jpMm: 228 },
  { us: "7", eu: "37", uk: "4", jpMm: 230 },
  { us: "7.5", eu: "37.5", uk: "4.5", jpMm: 233 },
  { us: "8", eu: "38", uk: "5", jpMm: 235 },
  { us: "8.5", eu: "38.5", uk: "5.5", jpMm: 238 },
  { us: "9", eu: "39", uk: "6", jpMm: 240 },
  { us: "9.5", eu: "39.5", uk: "6.5", jpMm: 243 },
  { us: "10", eu: "40", uk: "7", jpMm: 245 },
  { us: "10.5", eu: "40.5", uk: "7.5", jpMm: 248 },
  { us: "11", eu: "41", uk: "8", jpMm: 250 },
  { us: "11.5", eu: "41.5", uk: "8.5", jpMm: 253 },
  { us: "12", eu: "42", uk: "9", jpMm: 255 },
  // Covers `DC` (Scarpe Donna FR), whose last label is 42½.
  { us: "12.5", eu: "42.5", uk: "9.5", jpMm: 258 },
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
  // The youth run used to stop at 3Y, but `#BM` and `#BN` label youth sizes
  // up to 7 and 8. Without these rows those labels had nothing to match.
  { us: "3.5Y", eu: "35", uk: "3Y", jpMm: 215 },
  { us: "4Y", eu: "36", uk: "3.5Y", jpMm: 220 },
  { us: "4.5Y", eu: "36.5", uk: "4Y", jpMm: 225 },
  { us: "5Y", eu: "37", uk: "4.5Y", jpMm: 230 },
  { us: "5.5Y", eu: "37.5", uk: "5Y", jpMm: 235 },
  { us: "6Y", eu: "38", uk: "5.5Y", jpMm: 240 },
  { us: "6.5Y", eu: "38.5", uk: "6Y", jpMm: 245 },
  { us: "7Y", eu: "39", uk: "6.5Y", jpMm: 250 },
  { us: "7.5Y", eu: "39.5", uk: "7Y", jpMm: 255 },
  { us: "8Y", eu: "40", uk: "7.5Y", jpMm: 260 },
  { us: "8.5Y", eu: "41", uk: "8Y", jpMm: 265 },
  { us: "9Y", eu: "42", uk: "8.5Y", jpMm: 270 },
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
