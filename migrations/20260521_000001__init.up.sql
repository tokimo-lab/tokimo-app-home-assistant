-- HA app schema. Initial migration. Host migrator tracks applied versions in a ledger.
--
-- Dev-stage rewrite (P8.0.1): tile / group attributes were previously stored
-- on `entity_overrides` (group_id, group_primary, sub_function_role) which
-- forced a 1:1 entity ↔ tile relation. They now live on a dedicated pair of
-- tables (`accessory_groups` + `accessory_group_members`) so a single entity
-- can participate in multiple tiles (M:N).

CREATE TABLE instances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL DEFAULT 'My Home Assistant',
    base_url        TEXT NOT NULL,
    access_token    TEXT NOT NULL,
    verify_tls      BOOLEAN NOT NULL DEFAULT TRUE,
    last_connected_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rooms (
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
CREATE INDEX rooms_instance_sort_idx ON rooms (instance_id, sort_order);

CREATE TABLE room_entities (
    room_id         UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    entity_id       TEXT NOT NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (room_id, entity_id)
);
CREATE INDEX room_entities_entity_id_idx ON room_entities (entity_id);

CREATE TABLE entity_overrides (
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
    decimal_places  INTEGER,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (instance_id, entity_id)
);
CREATE INDEX entity_overrides_favorites_idx
    ON entity_overrides (instance_id, is_favorite, favorite_order)
    WHERE is_favorite = TRUE;
CREATE INDEX entity_overrides_area_idx
    ON entity_overrides (instance_id, area_id, sort_order)
    WHERE area_id IS NOT NULL;
CREATE INDEX entity_overrides_category_idx
    ON entity_overrides (instance_id, entity_category)
    WHERE entity_category IS NOT NULL;

-- Accessory tiles (M:N entity participation).
--
-- `natural_key` is the algorithmically stable identifier produced by
-- sync_visibility (e.g. `device::xxx`, `via::vid::aid`, `name::sha`). It is
-- the join key for idempotent UPSERT — re-running the sync with identical
-- inputs preserves the row's UUID `id` so foreign keys remain valid.
--
-- `source` distinguishes auto-generated groups (recreated by every sync)
-- from user-created `manual` groups (immune to auto teardown). Auto sync
-- never touches manual groups.
--
-- `display_name` / `custom_icon` are optional overrides; NULL means "fall
-- back to the primary entity's defaults" so a freshly synced tile renders
-- without requiring per-tile display state.
CREATE TABLE accessory_groups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id     UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    natural_key     TEXT NOT NULL,
    display_name    TEXT,
    custom_icon     TEXT,
    source          TEXT NOT NULL DEFAULT 'auto'
                        CHECK (source IN ('auto', 'manual')),
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (instance_id, natural_key)
);
CREATE INDEX accessory_groups_instance_idx
    ON accessory_groups (instance_id, sort_order);

-- M:N membership.
--
-- A single entity can belong to several tiles (e.g. the `_action` sensor of
-- a 2-gang switch promoted onto both the kitchen-light and sink-light tiles).
-- The composite PK enforces "one link per (group, entity)" while the partial
-- unique index `accessory_group_members_one_primary_idx` makes "≥2 primaries
-- per group" a hard DB-level error rather than a soft handler invariant.
CREATE TABLE accessory_group_members (
    group_id          UUID NOT NULL REFERENCES accessory_groups(id) ON DELETE CASCADE,
    entity_id         TEXT NOT NULL,
    instance_id       UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    is_primary        BOOLEAN NOT NULL DEFAULT FALSE,
    sub_function_role TEXT
                          CHECK (sub_function_role IS NULL
                                 OR sub_function_role IN ('hidden_in_aggregate','promoted_to_tile')),
    sort_order        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (group_id, entity_id)
);
CREATE INDEX accessory_group_members_entity_idx
    ON accessory_group_members (instance_id, entity_id);
CREATE UNIQUE INDEX accessory_group_members_one_primary_idx
    ON accessory_group_members (group_id) WHERE is_primary = TRUE;
