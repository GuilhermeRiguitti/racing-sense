import type { ReferenceLap } from '@telemetry/domain';
import type { ReferenceLapReaderPort } from '../ports/reference-lap-store.port.js';

export interface ListReferenceLapsDeps {
  readonly referenceLaps: ReferenceLapReaderPort;
}

export type ListReferenceLapsQuery = () => Promise<readonly ReferenceLap[]>;

export function createListReferenceLapsQuery(deps: ListReferenceLapsDeps): ListReferenceLapsQuery {
  return () => deps.referenceLaps.list();
}
