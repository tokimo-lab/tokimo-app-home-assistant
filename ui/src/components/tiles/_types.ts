import type {
  CallParams,
  EntitySize,
  EntityState,
  PendingOp,
} from "../../types";

export interface TileProps {
  entity: EntityState;
  instanceId: string;
  pending?: PendingOp;
  onCall: (params: CallParams) => void;
  t: (k: string) => string;
  /**
   * Resolved tile size (computed by TileGrid via effectiveSizeForEntity).
   * Tiles forward this to TileBaseStyle so the inner `data-size` attribute
   * matches the outer grid-span wrapper.
   */
  size: EntitySize;
}

export function tilePropsEqual(prev: TileProps, next: TileProps): boolean {
  return (
    prev.entity === next.entity &&
    prev.pending === next.pending &&
    prev.instanceId === next.instanceId &&
    prev.onCall === next.onCall &&
    prev.t === next.t &&
    prev.size === next.size
  );
}
