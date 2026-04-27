import type { CallParams, EntityState, PendingOp } from "../../types";

export interface TileProps {
  entity: EntityState;
  instanceId: string;
  pending?: PendingOp;
  onCall: (params: CallParams) => void;
  t: (k: string) => string;
}
