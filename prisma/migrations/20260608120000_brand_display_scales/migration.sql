-- Per-brand "main" scale override for PDP display.
-- JSON shape: Record<brand-slug, SourceScale> e.g. { "asics": "EU", "vans": "US" }.
-- Brand keys are lowercased + trimmed to match the slug convention used by
-- the processor's auto-derive (slugifyBrand). When a brand is absent or the
-- value is null/empty, the PDP falls back to the block's default_scale.
ALTER TABLE "Shop" ADD COLUMN "brandDisplayScales" JSONB;
