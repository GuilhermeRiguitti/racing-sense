import type { ReferenceLap, ReferenceLapId } from '@telemetry/domain';

export interface ReferenceLapReaderPort {
  list(): Promise<readonly ReferenceLap[]>;
  findById(id: ReferenceLapId): Promise<ReferenceLap | null>;
}

export interface ReferenceLapWriterPort {
  save(referenceLap: ReferenceLap): Promise<void>;
  delete(id: ReferenceLapId): Promise<void>;
}
