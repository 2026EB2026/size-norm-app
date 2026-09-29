-- Opt-out control over the `size-norm:error` product tag.
--
-- While the brand size guides are incomplete, a large share of the catalogue
-- fails to convert and every one of those products gets tagged. The tag is
-- visible on the product record and can leak into storefront filters, so a
-- merchant needs to be able to stop the app writing it without giving up
-- metafield processing or uninstalling.
--
-- Defaults to true: existing shops keep the behaviour they have today.
ALTER TABLE "Shop" ADD COLUMN "manageErrorTag" BOOLEAN NOT NULL DEFAULT true;
