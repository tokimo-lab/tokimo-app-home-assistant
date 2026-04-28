import type { CallParams, EntityState, PendingOp } from "../../types";

export interface DomainDetailProps {
  entity: EntityState;
  onCall: (params: CallParams) => void;
  pending: PendingOp | undefined;
  t: (k: string) => string;
}
