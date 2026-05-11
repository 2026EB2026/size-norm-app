import type { Gender } from "./types";

/**
 * Verifies that a product's declared gender matches the gender of the scale it
 * references. `unisex` and `kid` scales accept any product gender; `men` and
 * `women` scales require an exact product-gender match.
 *
 * Used at processing time (M4) to detect inconsistent metadata. Example: a
 * product has `gender = women` metafield but references scale `#G` (Uomo IT,
 * gender = men) → returns `false` → product goes to draft with code
 * GENDER_MISMATCH.
 */
export function validateGenderMatch(
  productGender: Gender,
  scaleGender: Gender,
): boolean {
  if (scaleGender === "unisex" || scaleGender === "kid") return true;
  return productGender === scaleGender;
}
