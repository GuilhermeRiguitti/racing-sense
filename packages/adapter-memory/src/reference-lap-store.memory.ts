import type { ReferenceLapReaderPort, ReferenceLapWriterPort } from '@telemetry/application';
import type { ReferenceLap, ReferenceLapId } from '@telemetry/domain';

export function createInMemoryReferenceLapStore(): ReferenceLapReaderPort & ReferenceLapWriterPort {
  const stored = new Map<string, ReferenceLap>();

  return {
    async list() {
      return [...stored.values()];
    },

    async findById(id: ReferenceLapId) {
      return stored.get(id) ?? null;
    },

    async save(referenceLap: ReferenceLap) {
      stored.set(referenceLap.id, referenceLap);
    },

    async delete(id: ReferenceLapId) {
      stored.delete(id);
    },
  };
}
