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

export const settingsFormSchema = z.object({
  globalDisplayMode: displayModeEnum,
  globalScale: sourceScaleEnum,
  fractionFormat: fractionFormatEnum,
  // JSON-encoded `Record<MarketCode, SourceScale>`. Empty string → no
  // overrides; null DB-side.
  marketScalesJson: z.string().default(""),
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
