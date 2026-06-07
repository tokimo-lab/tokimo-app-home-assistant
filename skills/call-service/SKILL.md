---
name: call-service
description: "Control Home Assistant devices by calling services. Turn lights on/off, lock doors, adjust climate, etc."
when-to-use: "When the user wants to control a Home Assistant device (turn on/off, toggle, set state, etc.)."
argument-hint: "<device name or entity_id> <action>"
version: "0.1.0"
context: inline
---

# Control Home Assistant Devices

## CRITICAL: Command Format

```
tokimo-app-home-assistant call <INSTANCE_ID> <DOMAIN> <SERVICE> --entity-id <ENTITY_ID>
```

**All four parts are REQUIRED.**

## Step 1: Get instance ID

```bash
tokimo-app-home-assistant instances
```

Copy the `ID` column value (UUID format).

## Step 2: Find entity ID

```bash
tokimo-app-home-assistant search <INSTANCE_ID> "次卧 灯"
```

Copy the `entity_id` from results (e.g., `light.bedroom_ceiling`).

## Step 3: Call service

```bash
tokimo-app-home-assistant call <INSTANCE_ID> light turn_on --entity-id <ENTITY_ID>
```

## CORRECT Example

```bash
# Step 1
tokimo-app-home-assistant instances
# -> 550e8400-e29b-41d4-a716-446655440000  My Home  ...

# Step 2
tokimo-app-home-assistant search 550e8400-e29b-41d4-a716-446655440000 "次卧 灯"
# -> light.bedroom_ceiling  off  light  次卧吸顶灯

# Step 3
tokimo-app-home-assistant call 550e8400-e29b-41d4-a716-446655440000 light turn_on --entity-id light.bedroom_ceiling
```

## Common Services

| Domain | Service | Description |
|--------|---------|-------------|
| `light` | `turn_on` | Turn on light |
| `light` | `turn_off` | Turn off light |
| `light` | `toggle` | Toggle light |
| `switch` | `turn_on` | Turn on switch |
| `switch` | `turn_off` | Turn off switch |
| `lock` | `lock` | Lock door |
| `lock` | `unlock` | Unlock door |

## WRONG Examples

```bash
# WRONG: Missing instance_id
tokimo-app-home-assistant call light turn_on --entity-id light.bedroom_ceiling  # ERROR!

# WRONG: Missing --entity-id
tokimo-app-home-assistant call 550e8400-e29b-41d4-a716-446655440000 light turn_on  # ERROR!

# WRONG: Combining commands
tokimo-app-home-assistant entity call ...  # ERROR!
```
