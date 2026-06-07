---
name: get-status
description: "Get the current status and details of a Home Assistant entity. View state, attributes, device info, and display settings."
when-to-use: "When the user wants to know the current state or details of a specific Home Assistant entity."
argument-hint: "<entity_id>"
version: "0.1.0"
context: inline
---

# Get Home Assistant Entity Status

**CLI command**: `tokimo-app-home-assistant entity <instance_id> <entity_id>`

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

3. **Get entity details**:

   ```bash
   tokimo-app-home-assistant entity <instance_id> <entity_id>
   ```

## Example: Check thermostat status

```bash
# Step 1: Get instance ID
tokimo-app-home-assistant instances
# Output: 550e8400-e29b-41d4-a716-446655440000  My Home  ...

# Step 2: Find the thermostat
tokimo-app-home-assistant search 550e8400-e29b-41d4-a716-446655440000 "thermostat"
# Output: climate.living_room  heat  climate  Living Room Thermostat

# Step 3: Get details
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

  Device:
    Manufacturer:  Nest
    Model:         Learning Thermostat

  Last Changed:  2026-06-06 15:30
  Last Updated:  2026-06-06 15:45
```

## Options

| Option | Description |
|--------|-------------|
| `--raw` | Output as JSON |
