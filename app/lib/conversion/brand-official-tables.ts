import { GUIDE_UFFICIALI_TABLES } from "./guide-ufficiali-tables";
import type { ConversionTable } from "./types";

/**
 * Official manufacturer size charts, attached to an Atelier scale for one
 * brand.
 *
 * These are BRAND-SPECIFIC conversion tables: `lookupConversion` prefers them
 * over the scale's generic table whenever the product's vendor matches
 * (case-insensitive, on the raw Shopify vendor string). So a product that the
 * ERP tagged `SCALATAGLIE_SCARPE UNISEX ADIDAS (UK)` keeps resolving to the
 * `SUA` scale — the tag still decides which system the labels are written in —
 * but the numbers come from the manufacturer instead of the in-house chart.
 *
 * Why this exists: the in-house tables were built to cover every brand with
 * one ladder, and on a per-brand basis they drift. The Atelier `SUA` table
 * maps UK 4 to EU 37 / US 5; adidas publishes UK 4 = EU 36⅔ = US 4.5. Half a
 * size, on every pair.
 *
 * Adding a brand:
 *   1. Take the chart from the manufacturer's own size guide, not a reseller.
 *   2. Key every row on the Atelier scale's canonical label (`sourceLabel`),
 *      not on the manufacturer's own axis — that is what `parseLabel` hands
 *      to `lookupConversion`.
 *   3. Leave a column `null` when the manufacturer doesn't publish it.
 *      Inventing a value is worse than showing nothing.
 *   4. `brand` must match the Shopify vendor string of the products.
 */
const HAND_WRITTEN: readonly ConversionTable[] = [
  {
    // Source: adidas.it/aiuto/size_charts/men-shoes — the unisex adult
    // footwear chart, read 2026-09-11.
    //
    // `us` carries adidas' "US - Uomo" column. adidas publishes a separate
    // "US - Donna" ladder exactly one size higher (UK 3½ = US-W 5); the
    // matrix has a single US slot, and men's US is the convention for
    // unisex sneaker listings.
    //
    // UK 3 is intentionally absent: adidas' ladder starts at UK 3½, so that
    // row falls through to the generic SUA table rather than being guessed.
    scaleSigla: "SUA",
    brand: "Adidas Originals",
    isSeed: true,
    mappings: [
      { sourceLabel: "3½", us: "4", eu: "36", uk: "3.5", cm: "22.1", jpMm: 221 },
      { sourceLabel: "4", us: "4.5", eu: "36⅔", uk: "4", cm: "22.5", jpMm: 225 },
      { sourceLabel: "4½", us: "5", eu: "37⅓", uk: "4.5", cm: "22.9", jpMm: 229 },
      { sourceLabel: "5", us: "5.5", eu: "38", uk: "5", cm: "23.3", jpMm: 233 },
      { sourceLabel: "5½", us: "6", eu: "38⅔", uk: "5.5", cm: "23.8", jpMm: 238 },
      { sourceLabel: "6", us: "6.5", eu: "39⅓", uk: "6", cm: "24.2", jpMm: 242 },
      { sourceLabel: "6½", us: "7", eu: "40", uk: "6.5", cm: "24.6", jpMm: 246 },
      { sourceLabel: "7", us: "7.5", eu: "40⅔", uk: "7", cm: "25", jpMm: 250 },
      { sourceLabel: "7½", us: "8", eu: "41⅓", uk: "7.5", cm: "25.5", jpMm: 255 },
      { sourceLabel: "8", us: "8.5", eu: "42", uk: "8", cm: "25.9", jpMm: 259 },
      { sourceLabel: "8½", us: "9", eu: "42⅔", uk: "8.5", cm: "26.3", jpMm: 263 },
      { sourceLabel: "9", us: "9.5", eu: "43⅓", uk: "9", cm: "26.7", jpMm: 267 },
      { sourceLabel: "9½", us: "10", eu: "44", uk: "9.5", cm: "27.1", jpMm: 271 },
      { sourceLabel: "10", us: "10.5", eu: "44⅔", uk: "10", cm: "27.6", jpMm: 276 },
      { sourceLabel: "10½", us: "11", eu: "45⅓", uk: "10.5", cm: "28", jpMm: 280 },
      { sourceLabel: "11", us: "11.5", eu: "46", uk: "11", cm: "28.4", jpMm: 284 },
      { sourceLabel: "11½", us: "12", eu: "46⅔", uk: "11.5", cm: "28.8", jpMm: 288 },
      { sourceLabel: "12", us: "12.5", eu: "47⅓", uk: "12", cm: "29.3", jpMm: 293 },
    ],
  },
  {
    // Source: drmartens.com/it/it/about/size-guide — the "TAGLIE BAMBINO"
    // table, read 2026-09-25. Its ETÀ column names each band, so the rows
    // below are the ones marked JUNIOR; the two largest come from the adult
    // table on the same page, which continues the same UK ladder (UK 3 = EU
    // 36 in both).
    //
    // Keyed on the ERP's zero-padded tenths ("100" = UK 10). Dr. Martens is
    // the only vendor using this scale.
    //
    // The merchant's guide pack contains a "Tabella taglie scarpe italiana"
    // filed under Dr Martens that reads IT 39 = UK 5 = 24.5 cm, contradicting
    // the rows below. It is not a Dr. Martens chart: the same bytes also sit
    // in the Stone Island folder, the image carries a country picker rather
    // than brand chrome, and its IT-UK gap is a flat 34 on every row -- the
    // generic Italian men's ladder. Dr. Martens' own gap widens with size
    // (UK 3 = EU 36, UK 15 = EU 50), which is what the chart below follows.
    // Re-checked against drmartens.com/eu/en_eu/about/size-guide on
    // 2026-10-02.
    //
    // `us` carries the guide's "US BAMBINI" column. It is null on the last
    // two rows: there the manufacturer only publishes US women's, which is a
    // different system, and a youth shoe labelled with a women's US size
    // would mislead. `cm` doubles as the JP mondopoint value — Japanese
    // sizing is foot length in centimetres.
    scaleSigla: "#CE",
    brand: "Dr. Martens",
    isSeed: true,
    mappings: [
      { sourceLabel: "100", us: "11", eu: "28", uk: "10", cm: "17", jpMm: 170 },
      { sourceLabel: "105", us: "11.5", eu: "28.5", uk: "10.5", cm: "17.5", jpMm: 175 },
      { sourceLabel: "110", us: "12", eu: "29", uk: "11", cm: "17.5", jpMm: 175 },
      { sourceLabel: "115", us: "12.5", eu: "30", uk: "11.5", cm: "18", jpMm: 180 },
      { sourceLabel: "120", us: "13", eu: "31", uk: "12", cm: "18.5", jpMm: 185 },
      { sourceLabel: "130", us: "1", eu: "32", uk: "13", cm: "19", jpMm: 190 },
      { sourceLabel: "010", us: "2", eu: "33", uk: "1", cm: "20", jpMm: 200 },
      { sourceLabel: "015", us: "2.5", eu: "33.5", uk: "1.5", cm: "20.5", jpMm: 205 },
      { sourceLabel: "020", us: "3", eu: "34", uk: "2", cm: "21", jpMm: 210 },
      { sourceLabel: "025", us: "3.5", eu: "35", uk: "2.5", cm: "21.5", jpMm: 215 },
      { sourceLabel: "030", us: "4", eu: "36", uk: "3", cm: "22", jpMm: 220 },
      { sourceLabel: "040", us: null, eu: "37", uk: "4", cm: "23", jpMm: 230 },
      { sourceLabel: "050", us: null, eu: "38", uk: "5", cm: "24", jpMm: 240 },
    ],
  },
  {
    // Source: crocsitalia.it/it/size-guide/bambino, read 2026-10-13.
    //
    // `us` repeats the C/J code because that code is the US kid size; Crocs
    // publishes no UK column, so `uk` stays null rather than being guessed.
    // `eu` carries the guide's "Taglia italiana suggerita", kept verbatim —
    // four of those rows are a range ("31/32") and collapsing them to one
    // number would be inventing a precision Crocs doesn't claim.
    scaleSigla: "#CR",
    brand: "Crocs",
    isSeed: true,
    mappings: [
      { sourceLabel: "C2/3", us: "C2/3", eu: "19/21", uk: null, cm: "10.7", jpMm: 107 },
      { sourceLabel: "C4", us: "C4", eu: "21", uk: null, cm: "11.5", jpMm: 115 },
      { sourceLabel: "C5", us: "C5", eu: "22", uk: null, cm: "12.3", jpMm: 123 },
      { sourceLabel: "C6", us: "C6", eu: "23", uk: null, cm: "13.2", jpMm: 132 },
      { sourceLabel: "C7", us: "C7", eu: "24", uk: null, cm: "14", jpMm: 140 },
      { sourceLabel: "C8", us: "C8", eu: "25", uk: null, cm: "14.9", jpMm: 149 },
      { sourceLabel: "C9", us: "C9", eu: "26", uk: null, cm: "15.7", jpMm: 157 },
      { sourceLabel: "C10", us: "C10", eu: "27", uk: null, cm: "16.6", jpMm: 166 },
      { sourceLabel: "C11", us: "C11", eu: "28", uk: null, cm: "17.4", jpMm: 174 },
      { sourceLabel: "C12", us: "C12", eu: "29", uk: null, cm: "18.3", jpMm: 183 },
      { sourceLabel: "C13", us: "C13", eu: "30", uk: null, cm: "19.1", jpMm: 191 },
      { sourceLabel: "J1", us: "J1", eu: "31/32", uk: null, cm: "20", jpMm: 200 },
      { sourceLabel: "J2", us: "J2", eu: "33/34", uk: null, cm: "20.8", jpMm: 208 },
      { sourceLabel: "J3", us: "J3", eu: "35/36", uk: null, cm: "21.7", jpMm: 217 },
      { sourceLabel: "J4", us: "J4", eu: "37", uk: null, cm: "22.5", jpMm: 225 },
      { sourceLabel: "J5", us: "J5", eu: "38", uk: null, cm: "23.3", jpMm: 233 },
      { sourceLabel: "J6", us: "J6", eu: "39", uk: null, cm: "24.2", jpMm: 242 },
    ],
  },
];

/**
 * Every official manufacturer chart the app seeds.
 *
 * `HAND_WRITTEN` holds the two charts transcribed by hand (adidas on the `SUA`
 * scale, Dr. Martens kids on `#CE`); the rest come from the brands' own size
 * guides and are generated — see guide-ufficiali-tables.ts.
 *
 * Order matters only in that `lookupConversion` takes the FIRST table matching
 * (scaleSigla, brand), so the hand-written ones win where both exist.
 */
export const BRAND_OFFICIAL_TABLES_V1: readonly ConversionTable[] = [
  ...HAND_WRITTEN,
  ...GUIDE_UFFICIALI_TABLES,
];

/** Every vendor string covered by an official chart, lowercased. */
export const BRANDS_WITH_OFFICIAL_TABLE: readonly string[] =
  BRAND_OFFICIAL_TABLES_V1.map((t) => (t.brand ?? "").toLowerCase());
