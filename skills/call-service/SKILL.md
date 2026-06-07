---
name: call-service
description: "Control Home Assistant devices by calling services. Turn lights on/off, lock doors, adjust climate, etc."
when-to-use: "When the user wants to control a Home Assistant device (turn on/off, toggle, set state, etc.)."
argument-hint: "<device name or entity_id> <action>"
version: "0.1.0"
context: inline
---

# Control Home Assistant Devices

**CLI command**: `tokimo-app-home-assistant call <instance_id> <domain> <service> --entity-id <entity_id>`

**Important**: This command requires:
1. `instance_id` — Get from `tokimo-app-home-assistant instances`
2. `entity_id` — Get from `tokimo-app-home-assistant search <instance_id> "<query>"`

## Step-by-Step

1. **Get the instance ID** (required):

   ```bash
   tokimo-app-home-assistant instances
   ```

2. **Find the entity ID** (required):

   ```bash
   tokimo-app-home-assistant search <instance_id> "<device name>"
   ```

3. **Call the service**:

   ```bash
   tokimo-app-home-assistant call <instance_id> <domain> <service> --entity-id <entity_id>
   ```

## Common Services

| Domain | Service | Example |
|--------|---------|---------|
| `light` | `turn_on` | `call <id> light turn_on --entity-id light.kitchen` |
| `light` | `turn_off` | `call <id> light turn_off --entity-id light.kitchen` |
| `light` | `toggle` | `call <id> light toggle --entity-id light.kitchen` |
| `switch` | `turn_on` | `call <id> switch turn_on --entity-id switch.fan` |
| `switch` | `turn_off` | `call <id> switch turn_off --entity-id switch.fan` |
| `lock` | `lock` | `call <id> lock lock --entity-id lock.front_door` |
| `lock` | `unlock` | `call <id> lock unlock --entity-id lock.front_door` |
| `climate` | `set_temperature` | `call <id> climate set_temperature --entity-id climate.living_room --data '{"temperature":23}'` |

## Example: Turn on a light with brightness

```bash
# Step 1: Get instance ID
tokimo-app-home-assistant instances
# Output: 550e8400-e29b-41d4-a716-446655440000  My Home  ...

# Step 2: Find the light
tokimo-app-home-assistant search 550e8400-e29b-41d4-a716-446655440000 "kitchen light"
# Output: light.kitchen_main  off  light  Kitchen Main Light

# Step 3: Turn on with brightness
tokimo-app-home-assistant call 550e8400-e29b-41d4-a716-446655440000 light turn_on \
  --entity-id light.kitchen_main \
  --data '{"brightness":128}'
```
