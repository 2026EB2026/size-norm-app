-- ERP scale tag → scale mapping.
--
-- Every product exported from the merchant's ERP carries a
-- `SCALATAGLIE_<nome scala>` tag whose value is the human-readable name of an
-- Atelier scale. That name determines the scale's base (US/EU/UK/JP-mm), so
-- reading it removes the guesswork that previously let a US-labelled product
-- be converted with an EU-based scale.
--
-- `tagValue` holds the NORMALIZED form of that value (trimmed, inner
-- whitespace collapsed, lowercased) so the lookup is a plain equality match.
-- Null for brand scales, which the ERP never references by tag; Postgres
-- allows any number of nulls under a unique index.
ALTER TABLE "SizeScale" ADD COLUMN "tagValue" TEXT;

-- Backfill the Atelier scales already seeded in existing shops. Brand scales
-- (sigla like "asics-women-adult") keep a null tagValue.
--
-- Two scales in one shop could in principle carry the same name (nothing
-- ever enforced uniqueness on it), and linking both would fail the unique
-- index below and break the deploy. So only the first scale per normalized
-- name gets the link; any twin stays null and can be connected by hand from
-- the Scale Taglie page.
WITH ranked AS (
  SELECT
    "id",
    lower(btrim(regexp_replace("name", '\s+', ' ', 'g'))) AS normalized,
    row_number() OVER (
      PARTITION BY "shopDomain",
                   lower(btrim(regexp_replace("name", '\s+', ' ', 'g')))
      ORDER BY "createdAt", "id"
    ) AS rn
  FROM "SizeScale"
  WHERE "sigla" NOT LIKE '%-%'
)
UPDATE "SizeScale" s
SET "tagValue" = r.normalized
FROM ranked r
WHERE s."id" = r."id" AND r.rn = 1 AND r.normalized <> '';

CREATE UNIQUE INDEX "SizeScale_shopDomain_tagValue_key"
  ON "SizeScale"("shopDomain", "tagValue");
