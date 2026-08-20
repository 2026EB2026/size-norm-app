/**
 * Deep links into the theme editor with our app block pre-selected.
 *
 * App Store requirement 5.1.3 asks apps that ship a theme app extension to
 * provide setup instructions *and*, strongly recommended, a deep link that
 * adds and previews the block for the merchant. Without it, "the PDP is
 * empty" is the single most common support ticket, because the merchant has
 * to find and add the block by hand.
 *
 * Link shape (see shopify.dev — theme app extension configuration):
 *   https://{shop}/admin/themes/current/editor
 *     ?template=product
 *     &addAppBlockId={extension_uuid}/{block_handle}
 *     &target=mainSection
 *
 * `extension_uuid` is the theme app extension's registration UUID — stable
 * for the lifetime of the extension, and visible in
 * `.shopify/deploy-bundle/manifest.json` after a deploy. It is not a secret
 * (it ends up in the merchant's browser URL), but it does change if the
 * extension is ever re-registered under a new app, so it is overridable via
 * env without a code change.
 */

/** Registration UUID of the `size-norm-pdp` theme app extension. */
export const THEME_EXTENSION_UUID =
  // eslint-disable-next-line no-undef
  process.env.SHOPIFY_THEME_EXTENSION_UUID ??
  "019e9303-6fb1-70ba-a18c-9fa35d6fc594";

/** File handle of the PDP block (blocks/conversion-table.liquid). */
export const PDP_BLOCK_HANDLE = "conversion-table";

/**
 * Builds the theme-editor deep link that drops the conversion block into the
 * product template's main section. Returns null when the shop domain is
 * missing, so callers can hide the button rather than render a broken link.
 */
export function themeEditorDeepLink(shopDomain: string | null): string | null {
  if (shopDomain === null || shopDomain.trim().length === 0) return null;
  const params = new URLSearchParams({
    template: "product",
    addAppBlockId: `${THEME_EXTENSION_UUID}/${PDP_BLOCK_HANDLE}`,
    target: "mainSection",
  });
  return `https://${shopDomain.trim()}/admin/themes/current/editor?${params.toString()}`;
}
