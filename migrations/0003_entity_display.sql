-- Apple Home–style display attributes on entity_overrides:
--   * size           — small/medium/large tile in the home screen grid
--   * is_favorite    — pinned to the Favorites strip
--   * favorite_order — manual ordering inside Favorites
--
-- Note: entity_overrides has no instance_id column today, so the partial
-- favorites index keys on (is_favorite, favorite_order) only.

ALTER TABLE entity_overrides
    ADD COLUMN IF NOT EXISTS size TEXT NOT NULL DEFAULT 'small',
    ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS favorite_order INTEGER NOT NULL DEFAULT 0;

ALTER TABLE entity_overrides
    DROP CONSTRAINT IF EXISTS entity_overrides_size_check;
ALTER TABLE entity_overrides
    ADD CONSTRAINT entity_overrides_size_check
        CHECK (size IN ('small','medium','large'));

CREATE INDEX IF NOT EXISTS entity_overrides_favorites_idx
    ON entity_overrides (is_favorite, favorite_order)
    WHERE is_favorite = TRUE;
