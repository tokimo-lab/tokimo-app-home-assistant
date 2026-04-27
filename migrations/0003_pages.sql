-- User-defined pages and the widgets pinned onto them.
--
-- A page is one tab in the Home Assistant app's bottom navigation. Three
-- "system" kinds (`home`, `rooms`, `devices`) are rendered with built-in
-- layouts and don't accept user-pinned widgets. `custom` pages are blank
-- canvases the user fills with widgets bound to HA entities.

CREATE TABLE IF NOT EXISTS pages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id     UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    icon            TEXT,
    kind            TEXT NOT NULL DEFAULT 'custom',
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (kind IN ('home','rooms','devices','custom'))
);

CREATE INDEX IF NOT EXISTS pages_instance_sort_idx ON pages (instance_id, sort_order);

CREATE TABLE IF NOT EXISTS page_widgets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id         UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    entity_id       TEXT NOT NULL,
    size            TEXT NOT NULL DEFAULT 'small',
    sort_order      INTEGER NOT NULL DEFAULT 0,
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (size IN ('small','medium','large'))
);

CREATE INDEX IF NOT EXISTS page_widgets_page_sort_idx ON page_widgets (page_id, sort_order);
