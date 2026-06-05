/**
 * Public API of the conversion engine.
 *
 * The engine is pure: no Shopify, no DB, no I/O. Consumers (webhook handlers,
 * bulk jobs, theme extension data prep) pass in the scale and tables they
 * loaded from DB and get back normalized labels / conversion results / format
 * outputs / boolean validations.
 */
export type {
  ConversionError,
  ConversionErrorCode,
  ConversionMapping,
  ConversionResult,
  ConversionTable,
  FractionFormat,
  Gender,
  NormalizedLabel,
  SizeScale,
  SourceScale,
} from "./types";

export { parseLabel } from "./parse-label";
export { formatLabel } from "./format-label";
export { validateGenderMatch } from "./validate-gender";
export { lookupConversion } from "./lookup-conversion";

export {
  ATELIER_SCALES_V1,
  ATELIER_SCALES_BY_SIGLA,
} from "./scales-seed";

export {
  GENERIC_CONVERSION_TABLES_V1,
  buildGenericConversionTable,
} from "./conversion-tables-seed";

export {
  BRAND_SCALES_V1,
  BRAND_CONVERSION_TABLES_V1,
} from "./brand-scales-seed";

export { BRAND_CM_OVERRIDES_V1 } from "./brand-cm-overrides";

export {
  MEN_MASTER,
  WOMEN_MASTER,
  KID_MASTER,
  findRowByColumn,
  type MasterRow,
} from "./master-tables";
