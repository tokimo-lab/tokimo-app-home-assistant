-- Multi-instance fix: entity_overrides must be scoped per HA instance.
-- Original 0001 PK was just entity_id; that collides when two families both
-- have e.g. light.kitchen. Apple Home–style design also needs area_id,
-- sort_order (for room ordering), and a clean is_favorite column (drop the
-- British "favourite" duplicate that 0003 inadvertently created next to a
-- new is_favorite).
--
-- entity_overrides has 0 rows in dev DB (verified) so a DROP+RECREATE is safe
-- and far cleaner than ALTERing PK + dropping columns.

DROP TABLE IF EXISTS entity_overrides CASCADE;

CREATE TABLE entity_overrides (
    instance_id     UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    entity_id       TEXT NOT NULL,
    display_name    TEXT,
    custom_icon     TEXT,
    area_id         UUID REFERENCES rooms(id) ON DELETE SET NULL,
    hidden          BOOLEAN NOT NULL DEFAULT FALSE,
    is_favorite     BOOLEAN NOT NULL DEFAULT FALSE,
    favorite_order  INTEGER NOT NULL DEFAULT 0,
    size            TEXT NOT NULL DEFAULT 'small'
                        CHECK (size IN ('small','medium','large')),
    sort_order      INTEGER NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (instance_id, entity_id)
);

CREATE INDEX entity_overrides_favorites_idx
    ON entity_overrides (instance_id, is_favorite, favorite_order)
    WHERE is_favorite = TRUE;

CREATE INDEX entity_overrides_area_idx
    ON entity_overrides (instance_id, area_id, sort_order)
    WHERE area_id IS NOT NULL;
