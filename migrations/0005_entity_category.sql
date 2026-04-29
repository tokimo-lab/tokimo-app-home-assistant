-- P1.0: Persist HA entity_category on entity_overrides so we can reason about
-- "primary vs diagnostic vs config" entities without re-querying the registry.
-- The column is NULL for any row that predates this migration; the WS sync
-- (sync_visibility::mark_default_hidden_for_entities) backfills it on the
-- next refresh_registries() call and uses NULL-vs-non-NULL as a one-shot
-- signal to default-hide diagnostic/config entities exactly once per row
-- (so user explicit hidden choices made after classification are preserved).

ALTER TABLE entity_overrides
    ADD COLUMN IF NOT EXISTS entity_category TEXT;

CREATE INDEX IF NOT EXISTS entity_overrides_category_idx
    ON entity_overrides (instance_id, entity_category)
    WHERE entity_category IS NOT NULL;
