import { z } from "zod";

export const genderEnum = z.enum(["MEN", "WOMEN", "UNISEX", "KID"]);
export const sourceScaleEnum = z.enum([
  "US",
  "EU",
  "UK",
  "JP_MM",
  "DOUBLE",
  "MW_COMBINED",
]);
export const displayModeEnum = z.enum([
  "SINGLE_SCALE",
  "FULL_TABLE",
  "MAIN_PLUS_TABLE",
]);
export const fractionFormatEnum = z.enum(["UNICODE", "DECIMAL", "ASCII"]);

/**
 * Form schema for create/edit of a SizeScale. The merchant submits labels as
 * a newline-separated string in the textarea; we split and trim. Aliases are
 * submitted as `key=value` lines.
 */
export const sizeScaleFormSchema = z.object({
  sigla: z
    .string()
    .trim()
    .min(1, "Sigla obbligatoria")
    .max(20, "Sigla troppo lunga (max 20 caratteri)"),
  name: z
    .string()
    .trim()
    .min(1, "Nome obbligatorio")
    .max(120, "Nome troppo lungo"),
  gender: genderEnum,
  sourceScale: sourceScaleEnum,
  // Newline-separated string, parsed into string[] by the action.
  labelsRaw: z.string().min(1, "Inserisci almeno un'etichetta"),
  // Newline-separated `input=canonical` pairs.
  aliasesRaw: z.string().default(""),
});

export type SizeScaleFormInput = z.infer<typeof sizeScaleFormSchema>;

/**
 * Parses the textarea content of the `labelsRaw` field into a clean string
 * array, removing empty lines and trimming each entry.
 */
export function parseLabels(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Parses the textarea content of the `aliasesRaw` field into a `{ key: value }`
 * map. Each non-empty line must contain a single `=`. Keys are lowercased to
 * match the parse-label engine's expectation.
 */
export function parseAliases(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim().toLowerCase();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (key.length === 0 || value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Serializes an aliases map back to textarea content for editing.
 */
export function aliasesToRaw(aliases: Record<string, string>): string {
  return Object.entries(aliases)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}
