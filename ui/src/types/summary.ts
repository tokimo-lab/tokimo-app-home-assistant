export interface UnavailableEntityRef {
  entity_id: string;
  name: string;
  last_changed: string;
}

export interface DomainCount {
  domain: string;
  on_count: number;
  total_count: number;
}

export interface InstanceSummary {
  unavailable_entities: UnavailableEntityRef[];
  domain_counts: DomainCount[];
}
