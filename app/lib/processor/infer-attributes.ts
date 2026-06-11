/**
 * Attribute inference for the "zero-setup" processing path.
 *
 * When a product arrives without the `size_norm.gender` metafield, the
 * orchestrator tries to infer gender (and age category) from the signals
 * Shopify already carries: tags, product type, and title. Likewise the
 * footwear gate accepts products whose title/tags clearly say "shoe" even
 * when `product_type` is empty (common for quickly-created products).
 *
 * All matching is token-based (split on non-letters) so "women" never
 * accidentally matches the "men" keyword, and Italian/English/French/German
 * retail vocabulary is covered.
 */

const WOMEN_TOKENS = new Set([
  "women",
  "woman",
  "womens",
  "donna",
  "donne",
  "femminile",
  "female",
  "damen",
  "femme",
  "lady",
  "ladies",
]);

const MEN_TOKENS = new Set([
  "men",
  "man",
  "mens",
  "uomo",
  "uomini",
  "maschile",
  "male",
  "herren",
  "homme",
]);

const KID_TOKENS = new Set([
  "kid",
  "kids",
  "bambino",
  "bambina",
  "bambini",
  "bimbo",
  "bimba",
  "junior",
  "boy",
  "boys",
  "girl",
  "girls",
  "ragazzo",
  "ragazza",
  "child",
  "children",
  "enfant",
  "baby",
  "infant",
  "toddler",
  "youth",
  "crib",
  "newborn",
  "neonato",
]);

const UNISEX_TOKENS = new Set(["unisex"]);

/** Age-category keywords → canonical age segment used in brand sigle. */
const AGE_TOKENS: Record<string, string> = {
  crib: "crib",
  newborn: "crib",
  neonato: "crib",
  infant: "infant",
  toddler: "toddler",
  youth: "youth",
  junior: "junior",
};

const FOOTWEAR_TOKENS = new Set([
  "shoe",
  "shoes",
  "scarpa",
  "scarpe",
  "sneaker",
  "sneakers",
  "boot",
  "boots",
  "stivale",
  "stivali",
  "stivaletto",
  "stivaletti",
  "sandal",
  "sandals",
  "sandalo",
  "sandali",
  "mocassino",
  "mocassini",
  "loafer",
  "loafers",
  "decollete",
  "décolleté",
  "pump",
  "pumps",
  "ballerina",
  "ballerine",
  "ciabatta",
  "ciabatte",
  "slipper",
  "slippers",
  "espadrillas",
  "espadrille",
  "footwear",
  "calzature",
  "calzatura",
  "running",
  "trainer",
  "trainers",
]);

/** Splits free text into lowercase word tokens (accent-preserving). */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-zà-ÿ0-9]+/i)
    .filter((t) => t.length > 0);
}

/** Collects all tokens from title + productType + tags into one set. */
function collectTokens(product: {
  title?: string | null;
  productType: string | null;
  tags: string[];
}): Set<string> {
  const tokens = new Set<string>();
  for (const t of tokenize(product.title ?? "")) tokens.add(t);
  for (const t of tokenize(product.productType ?? "")) tokens.add(t);
  for (const tag of product.tags) {
    for (const t of tokenize(tag)) tokens.add(t);
  }
  return tokens;
}

/**
 * Infers the product gender from title/productType/tags. Returns one of
 * the canonical engine values ("men" | "women" | "unisex" | "kid") or null
 * when no signal is found. Kid keywords win over adult genders ("scarpe
 * bambino" is kid even if "boy" is in MEN-adjacent space); when both men
 * and women tokens appear, the product is treated as unisex.
 */
export function inferGenderFromText(product: {
  title?: string | null;
  productType: string | null;
  tags: string[];
}): "men" | "women" | "unisex" | "kid" | null {
  const tokens = collectTokens(product);

  let hasKid = false;
  let hasWomen = false;
  let hasMen = false;
  let hasUnisex = false;
  for (const t of tokens) {
    if (KID_TOKENS.has(t)) hasKid = true;
    if (WOMEN_TOKENS.has(t)) hasWomen = true;
    if (MEN_TOKENS.has(t)) hasMen = true;
    if (UNISEX_TOKENS.has(t)) hasUnisex = true;
  }

  if (hasKid) return "kid";
  if (hasWomen && hasMen) return "unisex";
  if (hasWomen) return "women";
  if (hasMen) return "men";
  if (hasUnisex) return "unisex";
  return null;
}

/**
 * Infers the kid age-category segment (crib/infant/toddler/youth/junior)
 * from title/productType/tags, or null when no keyword is present. Only
 * meaningful when the inferred/declared gender is "kid".
 */
export function inferAgeCategoryFromText(product: {
  title?: string | null;
  productType: string | null;
  tags: string[];
}): string | null {
  const tokens = collectTokens(product);
  for (const [token, age] of Object.entries(AGE_TOKENS)) {
    if (tokens.has(token)) return age;
  }
  return null;
}

/**
 * True when the product's title/productType/tags contain an explicit
 * footwear keyword. Used as a fallback for the footwear gate when
 * `product_type` is empty or not in the configured whitelist.
 */
export function looksLikeFootwear(product: {
  title?: string | null;
  productType: string | null;
  tags: string[];
}): boolean {
  const tokens = collectTokens(product);
  for (const t of tokens) {
    if (FOOTWEAR_TOKENS.has(t)) return true;
  }
  return false;
}
