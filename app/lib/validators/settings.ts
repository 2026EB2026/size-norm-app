import { z } from "zod";

import {
  displayModeEnum,
  fractionFormatEnum,
  sourceScaleEnum,
} from "./size-scale";

export const marketScalesSchema = z.record(
  z.string().regex(/^[A-Z]{2,3}$/, "Codice market non valido"),
  sourceScaleEnum,
);

// Display-scale values that the theme block accepts as `default_scale`.
// Superset of sourceScaleEnum: includes CM (foot length in cm) which the
// snippet renders but isn't a sourceScale on the engine side.
export const displayScaleEnum = z.enum(["US", "EU", "UK", "CM", "JP_MM"]);

// Per-brand display scale: keys are lowercase + dashes (slugifyBrand
// convention used by the processor), values are any display scale.
// Empty/missing brand → fall back to the block's default_scale.
export const brandDisplayScalesSchema = z.record(
  z
    .string()
    .min(1, "Brand slug vuoto")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Brand slug non valido"),
  displayScaleEnum,
);

export const settingsFormSchema = z.object({
  globalDisplayMode: displayModeEnum,
  globalScale: sourceScaleEnum,
  fractionFormat: fractionFormatEnum,
  // JSON-encoded `Record<MarketCode, SourceScale>`. Empty string → no
  // overrides; null DB-side.
  marketScalesJson: z.string().default(""),
  // JSON-encoded `Record<brand-slug, SourceScale>`. Empty string → no
  // overrides; null DB-side.
  brandDisplayScalesJson: z.string().default(""),
});

export type SettingsFormInput = z.infer<typeof settingsFormSchema>;

export function parseMarketScales(
  raw: string,
): Record<string, z.infer<typeof sourceScaleEnum>> | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("marketScales JSON malformato");
  }
  return marketScalesSchema.parse(parsed);
}

export function parseBrandDisplayScales(
  raw: string,
): Record<string, z.infer<typeof displayScaleEnum>> | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("brandDisplayScales JSON malformato");
  }
  return brandDisplayScalesSchema.parse(parsed);
}
