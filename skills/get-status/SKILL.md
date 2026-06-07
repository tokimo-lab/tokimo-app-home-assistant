---
name: get-status
description: "Get the current status and details of a Home Assistant entity. View state, attributes, device info, and display settings."
when-to-use: "When the user wants to know the current state or details of a specific Home Assistant entity."
argument-hint: "<entity_id>"
version: "0.1.0"
context: inline
---

# Get Home Assistant Entity Status

**This is a multi-step process using TWO separate commands. Do NOT combine them.**

## Step 1: Search for the entity

Use the `search` command to find the entity_id:

```bash
tokimo-app-home-assistant search <instance_id> "<device name>"
```

Example:
```bash
tokimo-app-home-assistant search 550e8400-e29b-41d4-a716-446655440000 "次卧吸顶灯"
```

Output will show entity_id like `light.bedroom_ceiling`.

## Step 2: Get entity details

Use the `entity` command with the entity_id from Step 1:

```bash
tokimo-app-home-assistant entity <instance_id> <entity_id>
```

Example:
```bash
tokimo-app-home-assistant entity 550e8400-e29b-41d4-a716-446655440000 light.bedroom_ceiling
```

## Full Example

```bash
# Step 1: Get instance ID (if unknown)
tokimo-app-home-assistant instances
# Output: 550e8400-e29b-41d4-a716-446655440000  My Home  ...

# Step 2: Search for entity
tokimo-app-home-assistant search 550e8400-e29b-41d4-a716-446655440000 "次卧吸顶灯"
# Output: light.bedroom_ceiling  off  light  次卧吸顶灯

# Step 3: Get entity details
tokimo-app-home-assistant entity 550e8400-e29b-41d4-a716-446655440000 light.bedroom_ceiling
```

## WRONG Usage (do NOT do this)

```bash
# WRONG: Do not combine entity and search
tokimo-app-home-assistant entity search "次卧吸顶灯"  # ERROR!

# WRONG: Do not use search keyword as entity_id
tokimo-app-home-assistant entity <instance_id> search  # ERROR!
```
