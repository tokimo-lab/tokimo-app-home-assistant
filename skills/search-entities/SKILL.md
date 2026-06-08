---
name: search-entities
description: "Search for Home Assistant entities by name or entity_id. Use to find devices, sensors, lights, switches, etc. and get their current state."
when-to-use: "When the user asks to find, search, or list Home Assistant devices or entities."
argument-hint: "<search query>"
version: "0.2.0"
context: inline
---

# Search Home Assistant Entities

## Command Format

```
tokimo-app-home-assistant search "<QUERY>"
```

**Simple usage** — just search, no instance_id needed (auto-selects first instance if multiple).

**With options:**
```
tokimo-app-home-assistant search "<QUERY>" --instance <INSTANCE_ID>
tokimo-app-home-assistant search "<QUERY>" --domain light
tokimo-app-home-assistant search "<QUERY>" --state on
```

## Search Features

- **Space-separated AND matching**: `次卧 灯` matches entities containing BOTH "次卧" AND "灯"
- **Searches both entity_id and friendly_name**
- **Case-insensitive**

## Examples

```bash
# Simple search (auto-selects instance)
tokimo-app-home-assistant search "次卧 吸顶灯"
tokimo-app-home-assistant search "kitchen light"
tokimo-app-home-assistant search "卧室灯"

# With domain filter
tokimo-app-home-assistant search "卧室" --domain light

# With state filter
tokimo-app-home-assistant search "灯" --state on

# Specify instance (if multiple)
tokimo-app-home-assistant search "灯" --instance 550e8400-e29b-41d4-a716-446655440000
```

## Options

| Option | Description |
|--------|-------------|
| `--instance, -i <UUID>` | Specify instance ID (optional, auto-selects if only one) |
| `--domain, -d <type>` | Filter: `light`, `switch`, `sensor`, `climate`, etc. |
| `--state, -s <state>` | Filter: `on`, `off`, `unavailable`, etc. |
| `--limit, -l <n>` | Max results (default: 50) |
| `--include-hidden` | Show hidden entities |
| `--raw` | Output as JSON |

## WRONG Examples

```bash
# WRONG: Passing instance_id as first positional arg
tokimo-app-home-assistant search 550e8400... "次卧灯"  # ERROR!

# WRONG: Using entity subcommand
tokimo-app-home-assistant entity search "次卧灯"  # ERROR!
```
