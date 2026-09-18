import { toSessionId } from '@telemetry/domain';
import { aLap, aSeries, aSession } from '@telemetry/domain/testing';
import { describe, expect, it } from 'vitest';
import type { SessionReaderPort, SessionWriterPort } from '../ports/session-store.port.js';

export interface SessionStoreUnderTest {
  readonly reader: SessionReaderPort;
  readonly writer: SessionWriterPort;
}

/**
 * Contrato do armazenamento de sessões.
 *
 * Toda implementação — memória, arquivo, banco — roda esta suíte. É o que
 * transforma "substituível" em fato verificado: se um adapter novo passa aqui,
 * ele pode trocar o antigo sem nenhum caso de uso mudar (LSP).
 */
export function describeSessionStoreContract(
  name: string,
  createStore: () => SessionStoreUnderTest,
): void {
  describe(`${name} cumpre o contrato de SessionStore`, () => {
    it('devolve a sessão gravada', async () => {
      const { reader, writer } = createStore();
      const session = aSession();

      await writer.save({ session, laps: [aLap()], seriesByLap: new Map() });

      await expect(reader.findById(session.id)).resolves.toMatchObject({ id: session.id });
      await expect(reader.list()).resolves.toHaveLength(1);
    });

    it('devolve null para sessão inexistente, não erro', async () => {
      const { reader } = createStore();

      await expect(reader.findById(toSessionId('não-existe'))).resolves.toBeNull();
    });

    it('devolve as voltas gravadas com a sessão', async () => {
      const { reader, writer } = createStore();
      const session = aSession();

      await writer.save({
        session,
        laps: [aLap({ number: 1 }), aLap({ number: 2 })],
        seriesByLap: new Map(),
      });

      await expect(reader.listLaps(session.id)).resolves.toHaveLength(2);
    });

    it('devolve lista vazia de voltas para sessão inexistente', async () => {
      const { reader } = createStore();

      await expect(reader.listLaps(toSessionId('não-existe'))).resolves.toEqual([]);
    });

    it('devolve as séries da volta pedida e vazio para volta sem série', async () => {
      const { reader, writer } = createStore();
      const session = aSession();

      await writer.save({
        session,
        laps: [aLap({ number: 4 })],
        seriesByLap: new Map([[4, [aSeries()]]]),
      });

      await expect(reader.readLapSeries(session.id, 4)).resolves.toHaveLength(1);
      await expect(reader.readLapSeries(session.id, 99)).resolves.toEqual([]);
    });

    it('sobrescreve a sessão quando gravada de novo, sem duplicar', async () => {
      const { reader, writer } = createStore();
      const session = aSession();

      await writer.save({ session, laps: [aLap()], seriesByLap: new Map() });
      await writer.save({
        session: { ...session, driverName: 'Outro Piloto' },
        laps: [aLap()],
        seriesByLap: new Map(),
      });

      await expect(reader.list()).resolves.toHaveLength(1);
      await expect(reader.findById(session.id)).resolves.toMatchObject({
        driverName: 'Outro Piloto',
      });
    });

    it('apaga a sessão e o que veio com ela', async () => {
      const { reader, writer } = createStore();
      const session = aSession();

      await writer.save({
        session,
        laps: [aLap({ number: 4 })],
        seriesByLap: new Map([[4, [aSeries()]]]),
      });
      await writer.delete(session.id);

      await expect(reader.findById(session.id)).resolves.toBeNull();
      await expect(reader.listLaps(session.id)).resolves.toEqual([]);
      await expect(reader.readLapSeries(session.id, 4)).resolves.toEqual([]);
    });

    it('apagar sessão inexistente é no-op, não erro', async () => {
      const { writer } = createStore();

      await expect(writer.delete(toSessionId('não-existe'))).resolves.toBeUndefined();
    });
  });
}
