---
name: get-status
description: "Get the current status and details of a Home Assistant entity. View state, attributes, device info, and display settings."
when-to-use: "When the user wants to know the current state or details of a specific Home Assistant entity."
argument-hint: "<entity_id>"
version: "0.1.0"
context: inline
---

# Get Home Assistant Entity Status

## CRITICAL: Command Format

```
tokimo-app-home-assistant entity <INSTANCE_ID> <ENTITY_ID>
```

**Both arguments are REQUIRED. You must get them from previous commands.**

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

## Step 3: Get entity details

```bash
tokimo-app-home-assistant entity <PASTE_INSTANCE_ID> <PASTE_ENTITY_ID>
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
tokimo-app-home-assistant entity 550e8400-e29b-41d4-a716-446655440000 light.bedroom_ceiling
```

## WRONG Examples

```bash
# WRONG: Combining commands
tokimo-app-home-assistant entity search "次卧 灯"  # ERROR!

# WRONG: Missing instance_id
tokimo-app-home-assistant entity light.bedroom_ceiling  # ERROR!

# WRONG: Missing entity_id
tokimo-app-home-assistant entity 550e8400-e29b-41d4-a716-446655440000  # ERROR!
```
