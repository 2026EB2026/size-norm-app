import { z } from "zod";

/** A single mapping row in a ConversionTable. */
export const conversionMappingSchema = z.object({
  sourceLabel: z.string().trim().min(1),
  us: z.string().trim().nullable(),
  eu: z.string().trim().nullable(),
  uk: z.string().trim().nullable(),
  jpMm: z.coerce.number().int().positive().nullable(),
});

export type ConversionMappingInput = z.infer<typeof conversionMappingSchema>;

/**
 * Form schema for create/edit of a ConversionTable. The mappings come in as a
 * JSON-encoded array (the form serializes the editor state to JSON before
 * submission); the action parses and validates.
 */
export const conversionTableFormSchema = z.object({
  scaleSigla: z.string().trim().min(1, "Scala obbligatoria"),
  brand: z
    .string()
    .trim()
    .max(120, "Brand troppo lungo")
    .nullable()
    .transform((v) => (v === "" || v === null ? null : v)),
  mappingsJson: z.string().min(1, "Mappings obbligatori"),
});

export type ConversionTableFormInput = z.infer<typeof conversionTableFormSchema>;

/**
 * Parses the JSON-encoded mappings field into a validated array, or throws
 * a Zod error.
 */
export function parseMappingsJson(
  raw: string,
): z.infer<typeof conversionMappingSchema>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Mappings JSON malformato");
  }
  return z.array(conversionMappingSchema).parse(parsed);
}
