import { toReferenceLapId } from '@telemetry/domain';
import { aReferenceLap } from '@telemetry/domain/testing';
import { describe, expect, it } from 'vitest';
import type {
  ReferenceLapReaderPort,
  ReferenceLapWriterPort,
} from '../ports/reference-lap-store.port.js';

export interface ReferenceLapStoreUnderTest {
  readonly reader: ReferenceLapReaderPort;
  readonly writer: ReferenceLapWriterPort;
}

/** Contrato do armazenamento de voltas de referência. Ver session-store.contract.ts. */
export function describeReferenceLapStoreContract(
  name: string,
  createStore: () => ReferenceLapStoreUnderTest,
): void {
  describe(`${name} cumpre o contrato de ReferenceLapStore`, () => {
    it('devolve a referência gravada', async () => {
      const { reader, writer } = createStore();
      const reference = aReferenceLap();

      await writer.save(reference);

      await expect(reader.findById(reference.id)).resolves.toMatchObject({ id: reference.id });
      await expect(reader.list()).resolves.toHaveLength(1);
    });

    it('devolve null para referência inexistente', async () => {
      const { reader } = createStore();

      await expect(reader.findById(toReferenceLapId('não-existe'))).resolves.toBeNull();
    });

    it('preserva as séries da referência', async () => {
      const { reader, writer } = createStore();
      const reference = aReferenceLap();

      await writer.save(reference);
      const stored = await reader.findById(reference.id);

      expect(stored?.series).toHaveLength(reference.series.length);
      expect(stored?.series[0]?.axis).toBe('lapDistPct');
    });

    it('apaga a referência', async () => {
      const { reader, writer } = createStore();
      const reference = aReferenceLap();

      await writer.save(reference);
      await writer.delete(reference.id);

      await expect(reader.findById(reference.id)).resolves.toBeNull();
      await expect(reader.list()).resolves.toEqual([]);
    });
  });
}
