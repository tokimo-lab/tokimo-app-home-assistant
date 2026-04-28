import type { CallParams, EntityState, PendingOp } from "../../types";

export interface TileProps {
  entity: EntityState;
  instanceId: string;
  pending?: PendingOp;
  onCall: (params: CallParams) => void;
  t: (k: string) => string;
}

export function tilePropsEqual(prev: TileProps, next: TileProps): boolean {
  return (
    prev.entity === next.entity &&
    prev.pending === next.pending &&
    prev.instanceId === next.instanceId &&
    prev.onCall === next.onCall &&
    prev.t === next.t
  );
}
