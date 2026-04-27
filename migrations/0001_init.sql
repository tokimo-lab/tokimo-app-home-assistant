-- Home Assistant integration: instance config + local rooms

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

-- v1 only allows one row in instances; enforced in application layer.

CREATE TABLE IF NOT EXISTS rooms (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    icon            TEXT,
    accent          TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    -- when NULL the room was hand-created locally; when set it mirrors a HA area_id
    ha_area_id      TEXT UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rooms_sort_order_idx ON rooms (sort_order);

CREATE TABLE IF NOT EXISTS room_entities (
    room_id         UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    entity_id       TEXT NOT NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (room_id, entity_id)
);

CREATE INDEX IF NOT EXISTS room_entities_entity_id_idx ON room_entities (entity_id);

-- Per-entity overrides (custom name / hide / favourite). Sparse table.
CREATE TABLE IF NOT EXISTS entity_overrides (
    entity_id       TEXT PRIMARY KEY,
    custom_name     TEXT,
    custom_icon     TEXT,
    hidden          BOOLEAN NOT NULL DEFAULT FALSE,
    favourite       BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
