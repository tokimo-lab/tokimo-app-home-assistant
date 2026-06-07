---
name: search-entities
description: "Search for Home Assistant entities by name or entity_id. Use to find devices, sensors, lights, switches, etc. and get their current state."
when-to-use: "When the user asks to find, search, or list Home Assistant devices or entities."
argument-hint: "<search query>"
version: "0.1.0"
context: inline
---

# Search Home Assistant Entities

## CRITICAL: Command Format

```
tokimo-app-home-assistant search <INSTANCE_ID> "<QUERY>"
```

**The first argument MUST be an instance_id (UUID format like `550e8400-e29b-41d4-a716-446655440000`).**

## Step 1: Get instance ID (ALWAYS do this first)

```bash
tokimo-app-home-assistant instances
```

This outputs a table. Copy the `ID` column value (UUID format).

## Step 2: Search for entities

```bash
tokimo-app-home-assistant search <PASTE_INSTANCE_ID_HERE> "次卧 灯"
```

## CORRECT Examples

```bash
# Get instance ID first
tokimo-app-home-assistant instances
# Output: 550e8400-e29b-41d4-a716-446655440000  My Home  ...

# Then search (use the ID from above)
tokimo-app-home-assistant search 550e8400-e29b-41d4-a716-446655440000 "次卧 灯"
tokimo-app-home-assistant search 550e8400-e29b-41d4-a716-446655440000 "kitchen" --domain light
```

## WRONG Examples (do NOT do this)

```bash
# WRONG: Two separate words as args
tokimo-app-home-assistant search "次卧" "灯"  # ERROR! "次卧" is not an instance_id

# WRONG: Missing instance_id
tokimo-app-home-assistant search "次卧 灯"  # ERROR!

# WRONG: entity search combination
tokimo-app-home-assistant entity search "次卧 灯"  # ERROR!
```

## Options

| Option | Description |
|--------|-------------|
| `--domain <type>` | Filter: `light`, `switch`, `sensor`, `climate`, etc. |
| `--state <state>` | Filter: `on`, `off`, `unavailable`, etc. |
| `--limit <n>` | Max results (default: 50) |
| `--include-hidden` | Show hidden entities |
| `--raw` | Output as JSON |
