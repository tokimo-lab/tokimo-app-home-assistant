---
name: get-status
description: "Get the current status and details of a Home Assistant entity. View state, attributes, device info, and display settings."
when-to-use: "When the user wants to know the current state or details of a specific Home Assistant entity."
argument-hint: "<entity_id>"
version: "0.1.0"
context: inline
---

# Get Home Assistant Entity Status

View the current state and detailed information of a Home Assistant entity.

## Prerequisites

- At least one Home Assistant instance must be configured and connected.
- The target entity must exist (find it with `search`).

## Quick Reference

| Step | Command |
|------|---------|
| Find the entity | `tokimo-app-home-assistant search <instance_id> "<device name>"` |
| Get entity details | `tokimo-app-home-assistant entity <instance_id> <entity_id>` |
| Get raw JSON | `tokimo-app-home-assistant entity <instance_id> <entity_id> --raw` |

## Workflow

1. **Find the entity ID.** Search for the device you want to check.

   ```bash
   tokimo-app-home-assistant search <instance_id> "thermostat"
   ```

   Note the `entity_id` (e.g., `climate.living_room`).

2. **Get entity details.** View the current state and attributes.

   ```bash
   tokimo-app-home-assistant entity <instance_id> climate.living_room
   ```

   The output shows:
   - Current state (e.g., `heat`, `cool`, `off`)
   - Friendly name
   - Domain
   - Attributes (temperature, humidity, mode, etc.)
   - Device info (manufacturer, model, firmware)
   - Display settings (custom name, icon, hidden, favorite)

3. **(Optional) Get raw JSON.** For programmatic use or detailed inspection.

   ```bash
   tokimo-app-home-assistant entity <instance_id> climate.living_room --raw
   ```

## Worked Example

Check the living room thermostat:

```bash
# 1. Find the entity
tokimo-app-home-assistant search 550e8400-e29b-41d4-a716-446655440000 "thermostat"
#   -> entity_id: climate.living_room

# 2. Get details
tokimo-app-home-assistant entity 550e8400-e29b-41d4-a716-446655440000 climate.living_room
```

Output:
```
🌡️ climate.living_room
  State:       heat
  Name:        Living Room Thermostat
  Friendly:    Living Room Thermostat
  Domain:      climate

  Attributes:
    current_temperature    22.5
    target_temperature     23.0
    hvac_mode              heat
    humidity               45

  Device:
    Manufacturer:  Nest
    Model:         Learning Thermostat
    SW Version:    6.2-7

  Last Changed:  2026-06-06 15:30
  Last Updated:  2026-06-06 15:45
  Entity ID:     climate.living_room
```

## Notes

- Use `--raw` to get the full JSON response for programmatic use.
- Entity state is cached in memory; updates are received via WebSocket subscription.
- Some entities may have many attributes; the output shows the most relevant ones.
- Device info is available if the entity is linked to a device in the HA registry.
