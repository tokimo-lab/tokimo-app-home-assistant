---
name: ha-call-service
description: "Control Home Assistant devices by calling services. Turn lights on/off, lock doors, adjust climate, etc."
when-to-use: "When the user wants to control a Home Assistant device (turn on/off, toggle, set state, etc.)."
argument-hint: "<device name> <action>"
version: "0.3.0"
context: inline
---

# Control Home Assistant Devices

## Step 1: Find entity_id

```bash
tokimo-app-home-assistant search "次卧吸顶灯"
```

Output: `light.yeelink_ceil40_3fc8_light  on  light  次卧吸顶灯 灯`

## Step 2: Call service

```bash
tokimo-app-home-assistant call light turn_off --entity-id light.yeelink_ceil40_3fc8_light
```

**No instance_id needed** — auto-selects if only one exists.

## Common Services

| Domain | Service | Example |
|--------|---------|---------|
| `light` | `turn_on` | `call light turn_on --entity-id light.xxx` |
| `light` | `turn_off` | `call light turn_off --entity-id light.xxx` |
| `light` | `toggle` | `call light toggle --entity-id light.xxx` |
| `switch` | `turn_on` | `call switch turn_on --entity-id switch.xxx` |
| `switch` | `turn_off` | `call switch turn_off --entity-id switch.xxx` |

## With extra params

```bash
tokimo-app-home-assistant call light turn_on --entity-id light.xxx --data '{"brightness":128}'
```
