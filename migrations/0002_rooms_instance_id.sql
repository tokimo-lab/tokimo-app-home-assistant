-- Scope rooms by instance_id so multi-instance deployments don't collide on
-- ha_area_id (HA area_id is only unique within one instance). V6 hasn't
-- shipped yet, so any pre-existing rows are safe to drop.

DROP TABLE IF EXISTS room_entities CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;

CREATE TABLE rooms (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id     UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    icon            TEXT,
    accent          TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    -- when NULL the room was hand-created locally; when set it mirrors a HA area_id
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
