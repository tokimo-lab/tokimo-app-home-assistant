---
name: search-entities
description: "Search for Home Assistant entities by name or entity_id. Use to find devices, sensors, lights, switches, etc. and get their current state."
when-to-use: "When the user asks to find, search, or list Home Assistant devices or entities."
argument-hint: "<search query>"
version: "0.1.0"
context: inline
---

# Search Home Assistant Entities

**CLI command**: `tokimo-app-home-assistant search <instance_id> "<query>"`

**Important**: The `search` command requires an `instance_id` as the first argument.

## Step 1: Get instance ID

```bash
tokimo-app-home-assistant instances
```

Output: `ID  Name  URL  Status` — copy the `ID` value (UUID format).

## Step 2: Search for entities

```bash
tokimo-app-home-assistant search <instance_id> "<query>"
```

Example:
```bash
tokimo-app-home-assistant search 550e8400-e29b-41d4-a716-446655440000 "次卧吸顶灯"
```

Output: `entity_id  state  domain  display_name`

## Options

| Option | Description |
|--------|-------------|
| `--domain <type>` | Filter by domain: `light`, `switch`, `sensor`, `climate`, etc. |
| `--state <state>` | Filter by state: `on`, `off`, `unavailable`, etc. |
| `--limit <n>` | Max results (default: 50) |
| `--include-hidden` | Show hidden entities |
| `--raw` | Output as JSON |

## Full Example

```bash
# Step 1: Get instance ID
tokimo-app-home-assistant instances
# Output: 550e8400-e29b-41d4-a716-446655440000  My Home  http://192.168.1.100:8123  Connected

# Step 2: Search for lights in kitchen
tokimo-app-home-assistant search 550e8400-e29b-41d4-a716-446655440000 "kitchen" --domain light
```

## WRONG Usage (do NOT do this)

```bash
# WRONG: Missing instance_id
tokimo-app-home-assistant search "次卧吸顶灯"  # ERROR!

# WRONG: Using search as subcommand of entity
tokimo-app-home-assistant entity search "次卧吸顶灯"  # ERROR!
```
