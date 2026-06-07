---
name: search-entities
description: "Search for Home Assistant entities by name or entity_id. Use to find devices, sensors, lights, switches, etc. and get their current state."
when-to-use: "When the user asks to find, search, or list Home Assistant devices or entities."
argument-hint: "<search query>"
version: "0.1.0"
context: inline
---

# Search Home Assistant Entities

Find entities by name or entity_id across all configured Home Assistant instances.

## Prerequisites

- At least one Home Assistant instance must be configured in the app.
- The Home Assistant instance must be connected (check with `status`).

## Quick Reference

| Step | Command |
|------|---------|
| Check connection status | `tokimo-app-home-assistant status` |
| List all instances | `tokimo-app-home-assistant instances` |
| Search entities | `tokimo-app-home-assistant search <instance_id> "<query>"` |
| Filter by domain | `tokimo-app-home-assistant search <instance_id> "<query>" --domain light` |
| Filter by state | `tokimo-app-home-assistant search <instance_id> "<query>" --state on` |
| View entity details | `tokimo-app-home-assistant entity <instance_id> <entity_id>` |

## Workflow

1. **Get the instance ID.** List all instances and find the target instance.

   ```bash
   tokimo-app-home-assistant instances
   ```

   The output shows: `ID, Name, URL, Status`.

2. **Search for entities.** Use the instance ID and a search query.

   ```bash
   tokimo-app-home-assistant search <instance_id> "kitchen"
   ```

   Results show: `Entity ID, State, Domain, Friendly Name`.

3. **(Optional) Filter by domain.** Narrow results to specific device types.

   ```bash
   tokimo-app-home-assistant search <instance_id> "kitchen" --domain light
   ```

   Common domains: `light`, `switch`, `sensor`, `binary_sensor`, `climate`, `cover`, `fan`, `lock`, `media_player`.

4. **(Optional) Filter by state.** Find only entities in a specific state.

   ```bash
   tokimo-app-home-assistant search <instance_id> "kitchen" --state on
   ```

5. **(Optional) View entity details.** Get full information about a specific entity.

   ```bash
   tokimo-app-home-assistant entity <instance_id> light.kitchen
   ```

## Worked Example

Find all lights in the kitchen:

```bash
# 1. Get instance ID
tokimo-app-home-assistant instances
#   -> ID 550e8400-e29b-41d4-a716-446655440000  Name "My Home" ...

# 2. Search for kitchen lights
tokimo-app-home-assistant search 550e8400-e29b-41d4-a716-446655440000 "kitchen" --domain light

# 3. View details of a specific light
tokimo-app-home-assistant entity 550e8400-e29b-41d4-a716-446655440000 light.kitchen_main
```

## Notes

- The search query matches against both `entity_id` and `friendly_name` attribute.
- Use `--limit` to control the number of results (default: 50).
- Use `--raw` to get JSON output for programmatic use.
- Use `--include-hidden` to show entities marked as hidden in the app.
