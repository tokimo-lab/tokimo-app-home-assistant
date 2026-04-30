export type ConnStatus =
  | "connected"
  | "disconnected"
  | "connecting"
  | { error: string };

export interface HaInstance {
  id: string;
  name: string;
  base_url: string;
  access_token: string;
  verify_tls: boolean;
  status: ConnStatus;
  created_at?: string;
  updated_at?: string;
}

export interface CreateInstanceDto {
  name: string;
  base_url: string;
  access_token: string;
  verify_tls: boolean;
}

export type UpdateInstanceDto = Partial<CreateInstanceDto>;

export interface EntityAttributes {
  friendly_name?: string;
  unit_of_measurement?: string;
  device_class?: string;
  supported_features?: number;
  // Light
  brightness?: number;
  color_temp?: number;
  color_temp_kelvin?: number;
  min_color_temp_kelvin?: number;
  max_color_temp_kelvin?: number;
  rgb_color?: [number, number, number];
  color_mode?: string;
  // Climate
  min_temp?: number;
  max_temp?: number;
  temperature?: number;
  current_temperature?: number;
  hvac_modes?: string[];
  hvac_action?: string;
  // Fan
  percentage?: number;
  percentage_step?: number;
  oscillating?: boolean;
  // Cover
  current_position?: number;
  // Media Player
  media_title?: string;
  media_artist?: string;
  media_album_name?: string;
  entity_picture?: string;
  volume_level?: number;
  is_volume_muted?: boolean;
  media_content_type?: string;
  // Vacuum
  battery_level?: number;
  fan_speed?: string;
  fan_speed_list?: string[];
  // Generic
  icon?: string;
  [key: string]: unknown;
}

export interface EntityContext {
  id: string;
  user_id?: string | null;
  parent_id?: string | null;
}

export interface EntityOverride {
  friendly_name?: string;
  icon?: string;
  hidden?: boolean;
}

export type EntitySize = "small" | "medium" | "large";

export interface EntityDisplay {
  instance_id: string;
  entity_id: string;
  display_name?: string | null;
  custom_icon?: string | null;
  area_id?: string | null;
  hidden: boolean;
  is_favorite: boolean;
  favorite_order: number;
  size: EntitySize;
  sort_order: number;
  collapsed: boolean;
  /**
   * Accessory membership (P8.0.2 M:N): UUIDs of accessory groups this entity
   * belongs to. Primary / sub-function role now live on
   * `accessory_group_members` and are exposed via the `/accessories/:gid/members`
   * endpoint as {@link AccessoryMember}.
   */
  group_ids: string[];
  /** Per-entity numeric precision. `null` means "use frontend default". */
  decimal_places?: number | null;
  updated_at?: string;
}

export interface UpdateEntityDisplayDto {
  display_name?: string | null;
  custom_icon?: string | null;
  area_id?: string | null;
  hidden?: boolean;
  is_favorite?: boolean;
  favorite_order?: number;
  size?: EntitySize;
  sort_order?: number;
  collapsed?: boolean;
  /**
   * Per-entity numeric precision (0..=4).
   * - `number`: set the precision explicitly
   * - `null`: clear back to frontend default
   * - omitted: leave unchanged
   */
  decimal_places?: number | null;
}

/**
 * Accessory group (a "tile" that aggregates one or more entities). Returned
 * by `GET /instances/:id/accessories`. Membership lives on
 * {@link AccessoryMember} via `GET /accessories/:gid/members`.
 *
 * `source = 'auto'` rows are owned by sync_visibility and may be replaced on
 * the next sync; `source = 'manual'` rows are user-curated and never auto-removed.
 */
export interface AccessoryGroup {
  id: string;
  instance_id: string;
  natural_key: string;
  display_name: string | null;
  custom_icon: string | null;
  source: "auto" | "manual";
  sort_order: number;
}

/**
 * Single membership row from `accessory_group_members`. Returned by
 * `GET /accessories/:gid/members`. Mutate via:
 *   - PATCH `/accessories/:gid/members/:entity_id` (is_primary / sub_function_role / sort_order)
 *   - DELETE `/accessories/:gid/members/:entity_id`
 *   - POST `/accessories/:gid/members` (append)
 */
export interface AccessoryMember {
  entity_id: string;
  is_primary: boolean;
  sub_function_role: "hidden_in_aggregate" | "promoted_to_tile" | null;
  sort_order: number;
  /** Domain from the live entity state. `null` when HA hasn't pushed the entity yet. */
  domain: string | null;
  /** Friendly name from live state. */
  friendly_name: string | null;
}

export interface RoomReorderItem {
  room_id: string;
  sort_order: number;
}

export interface FavoriteReorderItem {
  entity_id: string;
  favorite_order: number;
}

export interface RoomEntityReorderItem {
  entity_id: string;
  sort_order: number;
}

export interface ReorderResult {
  updated: number;
}

/**
 * Device metadata sourced from HA's device_registry.
 * Only populated by the per-entity GET /entities/:eid endpoint
 * (list endpoints leave this undefined to keep payload small).
 */
export interface DeviceMeta {
  manufacturer?: string | null;
  model?: string | null;
  sw_version?: string | null;
  serial_number?: string | null;
  /** Resolved device display name (prefers name_by_user, falls back to name). */
  name?: string | null;
}

export interface EntityState {
  entity_id: string;
  state: string;
  attributes: EntityAttributes;
  last_changed: string;
  last_updated: string;
  context?: EntityContext;
  // Apple Home display fields (always present from backend, defaults applied)
  display_name?: string | null;
  custom_icon?: string | null;
  area_id?: string | null;
  hidden?: boolean;
  is_favorite?: boolean;
  favorite_order?: number;
  sort_order?: number;
  size?: EntitySize | null;
  /** Tier-3 demotion / dedup-by-device collapse flag. Set by the backend
   * sync_visibility默认固化 logic on first import; users can toggle via
   * `PATCH /entities/:eid/display`. Collapsed entities still render but
   * sit under a "show all" reveal. */
  collapsed?: boolean;
  /**
   * Accessory membership (P8.0.2 M:N): list of accessory_group UUIDs this
   * entity belongs to. Primary status / sub-function role are no longer on
   * the entity — fetch via `/accessories/:gid/members`.
   */
  group_ids?: string[];
  /** Per-entity numeric precision override; `null`/undefined → frontend default. */
  decimal_places?: number | null;
  /** Forward-compat: device grouping id from HA's entity_registry. */
  device_id?: string | null;
  /** Only populated by GET /entities/:eid single-fetch path. */
  device?: DeviceMeta;
  // legacy nested override (kept for back-compat)
  override?: EntityOverride;
}

export interface HaRoom {
  id: string;
  instance_id: string;
  name: string;
  icon?: string;
  entities: EntityState[];
}

export interface CreateRoomDto {
  name: string;
  icon?: string;
}

export type UpdateRoomDto = Partial<CreateRoomDto>;

export interface SyncAreasResult {
  created: number;
  updated: number;
}

export interface ServiceTarget {
  entity_id?: string | string[];
  area_id?: string | string[];
  device_id?: string | string[];
}

export interface ServiceCallBody {
  target?: ServiceTarget;
  data?: Record<string, unknown>;
}

export interface ServiceResult {
  operation_id: string;
  context_id?: string;
}

export interface PendingOp {
  operation_id: string;
  context_id?: string;
  entity_id: string;
  optimistic_state: EntityState;
  original_state: EntityState;
  created_at: number;
}

export interface TestResult {
  ok: boolean;
  version?: string;
  error?: string;
}

// SSE events
export interface SseSnapshotEvent {
  type: "snapshot";
  entities: EntityState[];
}

export interface SseUpdatedEvent {
  type: "updated";
  entity: EntityState;
  context_id?: string;
}

export interface SseRemovedEvent {
  type: "removed";
  entity_id: string;
}

export interface SseStatusEvent {
  type: "status";
  status: ConnStatus;
}

export interface SseResyncEvent {
  type: "resync";
}

export type SseEvent =
  | SseSnapshotEvent
  | SseUpdatedEvent
  | SseRemovedEvent
  | SseStatusEvent
  | SseResyncEvent;

export type SubPage = "home" | "room";

export interface ParsedRoute {
  page: "root" | "welcome" | "setup" | SubPage;
  instanceId?: string;
  roomId?: string;
}

export interface CallParams {
  entity_id: string;
  domain: string;
  service: string;
  target?: ServiceTarget;
  data?: Record<string, unknown>;
  optimisticState?: string;
  optimisticAttributes?: Partial<EntityAttributes>;
}
