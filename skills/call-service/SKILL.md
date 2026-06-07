---
name: call-service
description: "Control Home Assistant devices by calling services. Turn lights on/off, lock doors, adjust climate, etc."
when-to-use: "When the user wants to control a Home Assistant device (turn on/off, toggle, set state, etc.)."
argument-hint: "<device name or entity_id> <action>"
version: "0.1.0"
context: inline
---

# Control Home Assistant Devices

**This is a multi-step process using separate commands. Do NOT combine them.**

## Step 1: Get instance ID

```bash
tokimo-app-home-assistant instances
```

Output: `ID  Name  URL  Status` — copy the `ID` value (UUID format).

## Step 2: Find the entity ID

```bash
tokimo-app-home-assistant search <instance_id> "<device name>"
```

Example:
```bash
tokimo-app-home-assistant search 550e8400-e29b-41d4-a716-446655440000 "次卧吸顶灯"
```

Output: `light.bedroom_ceiling  off  light  次卧吸顶灯`

## Step 3: Call the service

```bash
tokimo-app-home-assistant call <instance_id> <domain> <service> --entity-id <entity_id>
```

Example:
```bash
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

## Full Example: Turn on light with brightness

```bash
# Step 1: Get instance ID
tokimo-app-home-assistant instances
# Output: 550e8400-e29b-41d4-a716-446655440000  My Home  ...

# Step 2: Find the light
tokimo-app-home-assistant search 550e8400-e29b-41d4-a716-446655440000 "次卧吸顶灯"
# Output: light.bedroom_ceiling  off  light  次卧吸顶灯

# Step 3: Turn on with brightness
tokimo-app-home-assistant call 550e8400-e29b-41d4-a716-446655440000 light turn_on \
  --entity-id light.bedroom_ceiling \
  --data '{"brightness":128}'
```

## WRONG Usage (do NOT do this)

```bash
# WRONG: Missing instance_id
tokimo-app-home-assistant call light turn_on --entity-id light.bedroom_ceiling  # ERROR!

# WRONG: Missing --entity-id
tokimo-app-home-assistant call 550e8400-e29b-41d4-a716-446655440000 light turn_on  # ERROR!

# WRONG: Using call as subcommand of entity
tokimo-app-home-assistant entity call ...  # ERROR!
```
