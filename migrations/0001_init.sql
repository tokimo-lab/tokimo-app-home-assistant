-- HA app schema. Single-file init. CREATE … IF NOT EXISTS for idempotency.

CREATE TABLE IF NOT EXISTS instances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL DEFAULT 'My Home Assistant',
    base_url        TEXT NOT NULL,
    access_token    TEXT NOT NULL,
    verify_tls      BOOLEAN NOT NULL DEFAULT TRUE,
    last_connected_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rooms (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id     UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    icon            TEXT,
    accent          TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    ha_area_id      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (instance_id, ha_area_id)
);
CREATE INDEX IF NOT EXISTS rooms_instance_sort_idx ON rooms (instance_id, sort_order);

CREATE TABLE IF NOT EXISTS room_entities (
    room_id         UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    entity_id       TEXT NOT NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (room_id, entity_id)
);
CREATE INDEX IF NOT EXISTS room_entities_entity_id_idx ON room_entities (entity_id);

CREATE TABLE IF NOT EXISTS entity_overrides (
    instance_id     UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    entity_id       TEXT NOT NULL,
    display_name    TEXT,
    custom_icon     TEXT,
    area_id         UUID REFERENCES rooms(id) ON DELETE SET NULL,
    hidden          BOOLEAN NOT NULL DEFAULT FALSE,
    is_favorite     BOOLEAN NOT NULL DEFAULT FALSE,
    favorite_order  INTEGER NOT NULL DEFAULT 0,
    size            TEXT
                        CHECK (size IS NULL OR size IN ('small','medium','large')),
    sort_order      INTEGER NOT NULL DEFAULT 0,
    entity_category TEXT,
    collapsed       BOOLEAN NOT NULL DEFAULT FALSE,
    group_id        TEXT,
    group_primary   BOOLEAN NOT NULL DEFAULT TRUE,
    decimal_places  INTEGER,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (instance_id, entity_id)
);
CREATE INDEX IF NOT EXISTS entity_overrides_favorites_idx
    ON entity_overrides (instance_id, is_favorite, favorite_order)
    WHERE is_favorite = TRUE;
CREATE INDEX IF NOT EXISTS entity_overrides_area_idx
    ON entity_overrides (instance_id, area_id, sort_order)
    WHERE area_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS entity_overrides_category_idx
    ON entity_overrides (instance_id, entity_category)
    WHERE entity_category IS NOT NULL;
CREATE INDEX IF NOT EXISTS entity_overrides_group_idx
    ON entity_overrides (instance_id, group_id)
    WHERE group_id IS NOT NULL;

-- Idempotent migration: add decimal_places to existing deployments without
-- requiring a DB reset. NULL means "use frontend default" (1 decimal place).
ALTER TABLE entity_overrides
  ADD COLUMN IF NOT EXISTS decimal_places INTEGER;

-- Idempotent migration: add visibility/grouping defaults columns to existing
-- deployments. The CREATE TABLE block above only fires on fresh databases;
-- pre-existing entity_overrides tables (created before these features
-- shipped) need explicit ALTERs. Defaults match the post-`sync_default_*`
-- baseline so existing rows look "untouched" until the next sync rewrites
-- them with computed values.
ALTER TABLE entity_overrides
  ADD COLUMN IF NOT EXISTS collapsed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE entity_overrides
  ADD COLUMN IF NOT EXISTS group_id TEXT;
ALTER TABLE entity_overrides
  ADD COLUMN IF NOT EXISTS group_primary BOOLEAN NOT NULL DEFAULT TRUE;
