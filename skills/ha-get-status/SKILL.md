---
name: ha-get-status
description: "Get the current status and details of a Home Assistant entity."
when-to-use: "When the user wants to know the current state or details of a specific Home Assistant entity."
argument-hint: "<entity_id>"
version: "0.2.0"
context: inline
---

# Get Home Assistant Entity Status

## Step 1: Find entity_id

```bash
tokimo-app-home-assistant search "次卧吸顶灯"
```

Output: `light.bedroom_ceiling  off  light  次卧吸顶灯`

## Step 2: Get details

```bash
tokimo-app-home-assistant entity light.bedroom_ceiling
```

**Note:** No instance_id needed — auto-selects if only one exists.

## Output

Shows: state, friendly_name, domain, attributes, device info, display settings.
