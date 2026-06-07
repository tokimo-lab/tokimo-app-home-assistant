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

**Important**: The `search` command requires an `instance_id` as the first argument. You must get this ID first by running `tokimo-app-home-assistant instances`.

## Step-by-Step

1. **Get the instance ID first** (required):

   ```bash
   tokimo-app-home-assistant instances
   ```

   This outputs a table with columns: `ID, Name, URL, Status`. Copy the `ID` value (UUID format like `550e8400-e29b-41d4-a716-446655440000`).

2. **Search for entities** using the instance ID:

   ```bash
   tokimo-app-home-assistant search <instance_id> "<query>"
   ```

   Example:
   ```bash
   tokimo-app-home-assistant search 550e8400-e29b-41d4-a716-446655440000 "次卧 吸顶灯"
   ```

## Options

| Option | Description |
|--------|-------------|
| `--domain <type>` | Filter by domain: `light`, `switch`, `sensor`, `climate`, etc. |
| `--state <state>` | Filter by state: `on`, `off`, `unavailable`, etc. |
| `--limit <n>` | Max results (default: 50) |
| `--include-hidden` | Show hidden entities |
| `--raw` | Output as JSON |

## Example

```bash
# Step 1: Get instance ID
tokimo-app-home-assistant instances
# Output: 550e8400-e29b-41d4-a716-446655440000  My Home  http://192.168.1.100:8123  Connected

# Step 2: Search for lights in kitchen
tokimo-app-home-assistant search 550e8400-e29b-41d4-a716-446655440000 "kitchen" --domain light
```
