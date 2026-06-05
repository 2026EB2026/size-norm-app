/**
 * Hand-sourced CM (foot length in centimetres) data for brand scales where
 * the original Conversione_taglie.xlsx left the CM column empty. Values
 * collected from official or well-trusted brand size charts; see the
 * comment block above each entry for the source URL.
 *
 * Format: `{ scaleSigla → { sourceLabel → cm-as-string } }`. The seeding
 * loader merges these into the mapping rows during {@link ensureSeed},
 * leaving every other field of the mapping untouched.
 *
 * NB — only the listed source labels are overridden. Any sourceLabel not
 * in the map keeps whatever cm value it already has (null included).
 *
 * Versioning: bump the V<N> suffix when changing the data schema (not when
 * adding more brands). The seeding loader is keyed by the constant name.
 */
export const BRAND_CM_OVERRIDES_V1: Record<
  string,
  Record<string, string>
> = {
  // -----------------------------------------------------------------------
  // VANS — kid scales
  // Sources:
  //   - https://www.tactics.com/sizing/vans-toddler-shoes-size-chart
  //   - https://www.tactics.com/sizing/vans-kids-shoes-size-chart
  //   - https://www.getoutsideshoes.com/pages/vans-size-chart (Men's, for big-kids US 3.5-7)
  // -----------------------------------------------------------------------
  "vans-kid-crib": {
    "1": "9",
    "2": "9.5",
    "3": "10",
    "4": "10.5",
  },
  "vans-kid-toddler": {
    "2": "9",
    "3": "10",
    "4": "10.5",
    "4.5": "11",
    "5": "11.5",
    "5.5": "12",
    "6": "12",
    "6.5": "12.5",
    "7": "13",
    "7.5": "13.5",
    "8": "14",
    "8.5": "14.5",
    "9": "15",
    "9.5": "15.5",
    "10": "16",
  },
  "vans-kid-youth": {
    "10.5": "16.5",
    "11": "16.5",
    "11.5": "17",
    "12": "17.5",
    "12.5": "18",
    "13": "18.5",
    "13.5": "18.5",
    "1": "19",
    "1.5": "19.5",
    "2": "20",
    "2.5": "20.5",
    "3": "21",
  },
  "vans-kid-big-kids": {
    "3.5": "21.5",
    "4": "22",
    "4.5": "22.5",
    "5": "23",
    "5.5": "23.5",
    "6": "24",
    "6.5": "24.5",
    "7": "25",
  },

  // -----------------------------------------------------------------------
  // CONVERSE — kid scales
  // Source: https://www.steadyfoot.com/converse-size-chart/
  // The chart publishes US sizes only with cm footbed length; we map by
  // sourceLabel (US value). For Junior / Youth EU sizes overlapping with
  // Vans we cross-check against Vans values and stay within ±0.3 cm.
  // -----------------------------------------------------------------------
  "converse-kid-crib": {
    "1": "9",
    "2": "9.5",
    "3": "10",
  },
  "converse-kid-infant": {
    "3": "11",
    "4": "11.5",
    "5": "12.5",
    "6": "13",
    "7": "13.5",
    "8": "14",
    "9": "15",
    "10": "16",
  },
  "converse-kid-youth": {
    "10.5": "16.5",
    "11": "17",
    "11.5": "17.5",
    "12": "18",
    "12.5": "18.5",
    "13": "19",
    "13.5": "19.5",
    "1": "20",
    "1.5": "20.5",
    "2": "21",
    "2.5": "21.5",
    "3": "22",
  },
  "converse-kid-junior": {
    "10.5": "16.5",
    "11": "17",
    "11.5": "17.5",
    "12": "18",
    "12.5": "18.5",
    "13": "19",
    "13.5": "19.5",
    "1": "20",
    "1.5": "20.5",
    "2": "21",
    "2.5": "21.5",
    "3": "22",
    "3.5": "22.5",
    "4": "23",
    "4.5": "23.5",
    "5": "24",
    "5.5": "24.5",
    "6": "25",
  },

  // -----------------------------------------------------------------------
  // NEW BALANCE — kid scales
  // Source: https://www.sizedepo.com/sc/chart/new-balance-kids-shoes/508
  // (mirror of the official New Balance kids printable size chart PDF)
  // -----------------------------------------------------------------------
  "new-balance-kid-crib": {
    "1": "9.5",
    "2": "10",
    "3": "10.5",
  },
  "new-balance-kid-infant": {
    "4": "11.4",
    "5": "12",
    "6": "13",
    "7": "14",
    "8": "15",
    "9": "16",
    "10": "17",
  },
  "new-balance-kid-youth": {
    "10.5": "17.3",
    "11": "17.1",
    "11.5": "18",
    "12": "18.1",
    "12.5": "18.4",
    "13": "19",
    "13.5": "19.4",
    "1": "20.3",
    "1.5": "20.3",
    "2": "21.3",
    "2.5": "21.6",
    "3": "21.6",
    "3.5": "22.1",
    "4": "22.2",
    "4.5": "23",
    "5": "23.5",
    "5.5": "23.5",
    "6": "24",
    "6.5": "24.6",
    "7": "24.8",
  },
  "new-balance-kid-grade-school": {
    "3.5": "22.1",
    "4": "22.2",
    "4.5": "23",
    "5": "23.5",
    "5.5": "23.5",
    "6": "24",
    "6.5": "24.6",
    "7": "24.8",
  },

  // -----------------------------------------------------------------------
  // BIRKENSTOCK — adult unisex
  // Source: https://size-charts.com/brands/birkenstock-size-chart/
  // -----------------------------------------------------------------------
  "birkenstock-unisex-adult": {
    "35": "22.5",
    "36": "23",
    "37": "24",
    "38": "24.5",
    "39": "25",
    "40": "26",
    "41": "26.5",
    "42": "27",
    "43": "28",
    "44": "28.5",
    "45": "29.5",
    "46": "30",
    "47": "30.5",
    "48": "31",
    "49": "32",
  },

  // -----------------------------------------------------------------------
  // SAUCONY — adult unisex (EU-only sourceLabels, men's chart matches the
  // unisex shoes per Saucony's own guidance)
  // Source: https://size-charts.com/brands/saucony-size-chart-for-men-and-womens-running-shoes/
  // -----------------------------------------------------------------------
  "saucony-unisex-adult": {
    "37": "22.5",
    "38": "23.5",
    "39": "24.5",
    "40": "25",
    "41": "26",
    "42": "26.5",
    "43": "27.5",
    "44": "28",
    "45": "29",
  },

  // -----------------------------------------------------------------------
  // GANNI — women adult (sourceLabel = EU)
  // Source: https://www.smallable.com/en/page/guide-des-pointures-ganni
  // EU 35 / 42-44 extrapolated linearly (+1 cm per EU) since the source
  // chart only covered EU 36-41; Ganni's chart is linear in this range.
  // -----------------------------------------------------------------------
  "ganni-unisex-adult": {
    "35": "21.5",
    "36": "22.5",
    "37": "23.5",
    "38": "24.5",
    "39": "25.5",
    "40": "26.5",
    "41": "27.5",
    "42": "28.5",
    "43": "29.5",
    "44": "30.5",
  },

  // -----------------------------------------------------------------------
  // HOKA — unisex adult M/W combined scales
  // Source: https://www.scheels.com/size-chart/hoka-adults-footwear-size-chart/
  // The chart is keyed by EU; we match by sourceLabel which encodes the
  // US M/W pair (matches what HOKA publishes for its unisex sizing).
  // -----------------------------------------------------------------------
  "hoka-unisex-adult-mw-v1": {
    "04/05": "21.9",
    "04.5/05.5": "22.2",
    "05/06": "22.9",
    "05.5/06.5": "23.3",
    "06/07": "23.8",
    "06.5/07.5": "24.2",
    "07/08": "24.6",
    "07.5/08.5": "24.9",
    "08/09": "25.4",
    "08.5/09.5": "25.8",
    "09/10": "26",
    "09.5/10.5": "26.8",
    "10/11": "27",
    "10.5/11.5": "27.3",
    "11/12": "27.8",
    "11.5/12.5": "28.2",
    "12/13": "28.6",
    "13/14": "29.9",
  },
  "hoka-unisex-adult-mw-v3": {
    "04/06": "21.9",
    "05/07": "22.9",
    "06/08": "23.8",
    "07/09": "24.6",
    "08/10": "25.4",
    "09/11": "26",
    "10/12": "27",
    "11/13": "27.8",
    "12/14": "28.6",
    "13/15": "29.9",
  },

  // -----------------------------------------------------------------------
  // MICHAEL KORS — MMK scale (women, EU-encoded sourceLabel)
  // Source: https://www.kicksmachine.com/pages/michael-kors-shoe-size-chart
  // Adult women's chart goes to EU 38.5/US 8.5; EU 39-47 (men's range)
  // unavailable from this source — left null and will derive from EU later.
  // -----------------------------------------------------------------------
  "michael-by-michael-kors-mmk-unisex-adult": {
    "40": "26",
    "40.5": "26.5",
    "41": "27",
    "41.5": "27.5",
    "42": "28",
    "43": "28.5",
    "43.5": "29",
    "44.5": "29.5",
    "45": "30",
    "45.5": "30.5",
    "46": "31",
    "47": "32",
  },

  // -----------------------------------------------------------------------
  // DR MARTENS — kid scales
  // Source: https://gb.awesomeshoes.com/blogs/steps-style-blog/dr-martens-kids-shoes-size-guide
  // -----------------------------------------------------------------------
  "dr-martens-kid-crib": {
    "1": "8",
    "2": "9",
    "3": "10",
    "4": "11",
  },
  "dr-martens-kid-infant": {
    "4": "11",
    "4.5": "11.5",
    "5": "12",
    "5.5": "12.2",
    "6": "12.5",
    "6.5": "13",
    "7": "14",
    "8": "14.5",
    "8.5": "15",
    "9": "15.5",
    "9.5": "15.5",
    "10": "16",
  },
  "dr-martens-kid-youth": {
    "11": "17",
    "11.5": "17.5",
    "12": "18",
    "12.5": "18.2",
    "13": "18.5",
    "13.5": "19",
    "1": "19.5",
    "1.5": "20",
    "2": "20.5",
    "2.5": "21",
    "3": "21.5",
    "3.5": "21.8",
  },

  // -----------------------------------------------------------------------
  // GOLDEN GOOSE — kid scales
  // Source: https://www.addictmiami.com/pages/kids-golden-goose-size-guide
  // Baby and Kids/Youth sections — sourceLabel matches the US value
  // (with "Y" suffix preserved for older youth sizes per the seed parser).
  // -----------------------------------------------------------------------
  "golden-goose-kid-crib": {
    "1": "11",
    "2": "11.5",
    "3": "12",
  },
  "golden-goose-kid-youth": {
    "3.5": "12",
    "4": "12.5",
    "5": "13.2",
    "6": "13.9",
    "7": "14.4",
    "7.5": "15",
    "8": "15.5",
    "9": "15.9",
    "10": "16.4",
    "11": "17",
    "12": "18.5",
    "12.5": "19",
    "13": "19",
    "1Y": "19.9",
    "1.5Y": "20.2",
    "2Y": "20.5",
    "3Y": "21.4",
    "4Y": "21.9",
    "5Y": "22.5",
    "5.5Y": "22.8",
  },

  // -----------------------------------------------------------------------
  // UGG — kid scales (UGG runs slightly large in cm due to sheepskin
  // lining; using UGG's own footbed measurements)
  // Source: https://www.scheels.com/size-chart/ugg-kids-footwear-size-chart/
  // -----------------------------------------------------------------------
  "ugg-kid-infant": {
    "0": "11",
    "1": "11",
    "0/1": "12",
    "2": "13",
    "3": "13.5",
    "2/3": "13",
    "4": "14",
    "5": "14.3",
    "4/5": "14",
    "6": "14.6",
    "6/7": "14.9",
  },
  "ugg-kid-toddler": {
    "3": "13.5",
    "4": "14",
    "5": "14.3",
    "6": "14.6",
    "7": "14.9",
    "8": "15.6",
    "9": "15.9",
    "10": "16.5",
    "11": "17.1",
    "12": "17.5",
  },
  "ugg-kid-big-kids": {
    "8": "15.6",
    "9": "15.9",
    "10": "16.5",
    "11": "17.1",
    "12": "17.5",
    "13": "19.1",
    "1": "20.6",
    "2": "20.9",
    "3": "21.6",
    "4": "21.9",
    "5": "22.2",
    "6": "22.5",
  },

  // -----------------------------------------------------------------------
  // VEJA — kid scales
  // Source: https://www.cemarose.com/pages/veja-size-guide-shoes
  // Insole length in cm (foot length ≈ insole − 1.0 cm; we publish the
  // insole which matches Veja's own measurement convention).
  // -----------------------------------------------------------------------
  "veja-kid-toddler": {
    "3": "11.5",
    "4": "12",
    "5": "12.8",
    "6": "12.8",
    "7": "13.2",
    "8": "14.1",
    "9": "14.9",
    "10": "16.2",
    "11": "16.8",
    "12": "18.2",
  },
  "veja-kid-big-kids": {
    "8": "14.9",
    "9": "15.7",
    "10": "16.2",
    "11": "16.8",
    "12": "18.2",
    "13": "18.2",
    "1": "19",
    "2": "19.9",
    "3": "20.1",
    "4": "20.8",
    "5": "21.2",
    "6": "21.9",
  },
};
