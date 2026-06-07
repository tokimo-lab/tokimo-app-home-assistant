---
name: call-service
description: "Control Home Assistant devices by calling services. Turn lights on/off, lock doors, adjust climate, etc."
when-to-use: "When the user wants to control a Home Assistant device (turn on/off, toggle, set state, etc.)."
argument-hint: "<device name or entity_id> <action>"
version: "0.1.0"
context: inline
---

# Control Home Assistant Devices

Call Home Assistant services to control devices like lights, switches, locks, climate, etc.

## Prerequisites

- At least one Home Assistant instance must be configured and connected.
- The target entity must exist (find it with `search`).

## Quick Reference

| Step | Command |
|------|---------|
| Find the entity | `tokimo-app-home-assistant search <instance_id> "<device name>"` |
| Turn on a light | `tokimo-app-home-assistant call <instance_id> light turn_on --entity-id <entity_id>` |
| Turn off a light | `tokimo-app-home-assistant call <instance_id> light turn_off --entity-id <entity_id>` |
| Toggle a switch | `tokimo-app-home-assistant call <instance_id> switch toggle --entity-id <entity_id>` |
| Lock a door | `tokimo-app-home-assistant call <instance_id> lock lock --entity-id <entity_id>` |
| Unlock a door | `tokimo-app-home-assistant call <instance_id> lock unlock --entity-id <entity_id>` |
| Set brightness | `tokimo-app-home-assistant call <instance_id> light turn_on --entity-id <entity_id> --data '{"brightness":128}'` |

## Common Services

| Domain | Service | Description |
|--------|---------|-------------|
| `light` | `turn_on` | Turn on a light (supports brightness, color, etc.) |
| `light` | `turn_off` | Turn off a light |
| `light` | `toggle` | Toggle light state |
| `switch` | `turn_on` | Turn on a switch |
| `switch` | `turn_off` | Turn off a switch |
| `switch` | `toggle` | Toggle switch state |
| `lock` | `lock` | Lock a lock |
| `lock` | `unlock` | Unlock a lock |
| `climate` | `set_temperature` | Set target temperature |
| `climate` | `set_hvac_mode` | Set HVAC mode (heat, cool, auto, etc.) |
| `cover` | `open_cover` | Open a cover/blind |
| `cover` | `close_cover` | Close a cover/blind |
| `fan` | `turn_on` | Turn on a fan |
| `fan` | `turn_off` | Turn off a fan |
| `media_player` | `play` | Play media |
| `media_player` | `pause` | Pause media |
| `media_player` | `volume_set` | Set volume |

## Workflow

1. **Find the entity ID.** Search for the device you want to control.

   ```bash
   tokimo-app-home-assistant search <instance_id> "kitchen light"
   ```

   Note the `entity_id` (e.g., `light.kitchen_main`).

2. **Call the service.** Use the appropriate domain and service.

   ```bash
   tokimo-app-home-assistant call <instance_id> light turn_on --entity-id light.kitchen_main
   ```

3. **(Optional) Pass additional parameters.** Use `--data` for extra options.

   ```bash
   tokimo-app-home-assistant call <instance_id> light turn_on --entity-id light.kitchen_main --data '{"brightness":128,"color_temp":350}'
   ```

## Worked Example

Turn on the kitchen light at 50% brightness:

```bash
# 1. Find the entity
tokimo-app-home-assistant search 550e8400-e29b-41d4-a716-446655440000 "kitchen light"
#   -> entity_id: light.kitchen_main

# 2. Turn on with brightness
tokimo-app-home-assistant call 550e8400-e29b-41d4-a716-446655440000 light turn_on \
  --entity-id light.kitchen_main \
  --data '{"brightness":128}'
```

## Notes

- The `--entity-id` parameter is required for all service calls.
- Use `--data` to pass additional parameters as JSON (brightness, color, temperature, etc.).
- Service calls are asynchronous; the command returns immediately with a context_id.
- Some services require specific parameters (e.g., `set_temperature` needs `temperature`).
