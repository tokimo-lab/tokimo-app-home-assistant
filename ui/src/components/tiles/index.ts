import { getDomain } from "../../lib/domain";
import type { EntityState } from "../../types";
import type { TileProps } from "./_types";
import { BinarySensorTile } from "./BinarySensorTile";
import { CameraTile } from "./CameraTile";
import { ClimateTile } from "./ClimateTile";
import { CoverTile } from "./CoverTile";
import { FanTile } from "./FanTile";
import { LightTile } from "./LightTile";
import { LockTile } from "./LockTile";
import { MediaPlayerTile } from "./MediaPlayerTile";
import { SceneTile } from "./SceneTile";
import { ScriptTile } from "./ScriptTile";
import { SensorTile } from "./SensorTile";
import { SwitchTile } from "./SwitchTile";
import { VacuumTile } from "./VacuumTile";

export type TileComponent = React.FC<TileProps>;

const DOMAIN_TILES: Record<string, TileComponent> = {
  light: LightTile,
  switch: SwitchTile,
  cover: CoverTile,
  climate: ClimateTile,
  fan: FanTile,
  lock: LockTile,
  media_player: MediaPlayerTile,
  scene: SceneTile,
  script: ScriptTile,
  binary_sensor: BinarySensorTile,
  sensor: SensorTile,
  camera: CameraTile,
  vacuum: VacuumTile,
  input_boolean: SwitchTile,
  automation: SwitchTile,
};

export function resolveTile(entity: EntityState): TileComponent {
  const domain = getDomain(entity.entity_id);
  return DOMAIN_TILES[domain] ?? SensorTile;
}

export {
  BinarySensorTile,
  CameraTile,
  ClimateTile,
  CoverTile,
  FanTile,
  LightTile,
  LockTile,
  MediaPlayerTile,
  SceneTile,
  ScriptTile,
  SensorTile,
  SwitchTile,
  VacuumTile,
};
