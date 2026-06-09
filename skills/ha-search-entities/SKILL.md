---
name: ha-search-entities
description: "Search for Home Assistant entities by name or entity_id."
when-to-use: "When the user asks to find, search, or list Home Assistant devices or entities."
argument-hint: "<search query>"
version: "0.2.0"
context: inline
---

# Search Home Assistant Entities

## Command

```
tokimo-app-home-assistant search "<QUERY>"
```

That's it. No instance_id needed — auto-selects if only one exists.

## Examples

```bash
tokimo-app-home-assistant search "次卧 吸顶灯"
tokimo-app-home-assistant search "卧室灯"
tokimo-app-home-assistant search "kitchen light" --domain light
```

## Options

| Option | Description |
|--------|-------------|
| `--domain, -d <type>` | Filter by domain |
| `--state, -s <state>` | Filter by state |
| `--limit, -l <n>` | Max results |
| `--raw` | JSON output |

## Notes

- Space-separated words = AND matching: `次卧 灯` matches entities with BOTH words
- Searches entity_id, friendly_name, and display_name
