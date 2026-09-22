import { NotFoundError } from '@telemetry/domain';
import { aLap, aSeries, aSession } from '@telemetry/domain/testing';
import { describe, expect, it } from 'vitest';
import type { SessionReaderPort } from '../ports/session-store.port.js';
import { createGetLapSeriesQuery } from './get-lap-series.query.js';

const session = aSession();

const leitor = (overrides: Partial<SessionReaderPort> = {}): SessionReaderPort => ({
  list: async () => [session],
  findById: async () => session,
  listLaps: async () => [aLap({ number: 3 })],
  readLapSeries: async () => [aSeries()],
  ...overrides,
});

describe('GetLapSeries', () => {
  it('devolve as séries gravadas da volta', async () => {
    const query = createGetLapSeriesQuery({ sessions: leitor() });

    const series = await query({ sessionId: session.id, lapNumber: 3 });

    expect(series.map((s) => s.channel)).toEqual(['Speed']);
  });

  it('serve volta inválida: mostrar não é analisar', async () => {
    const query = createGetLapSeriesQuery({
      sessions: leitor({ listLaps: async () => [aLap({ number: 3, flags: ['off-track'] })] }),
    });

    await expect(query({ sessionId: session.id, lapNumber: 3 })).resolves.toHaveLength(1);
  });

  it('volta que não existe é "não encontrada"', async () => {
    const query = createGetLapSeriesQuery({ sessions: leitor() });

    await expect(query({ sessionId: session.id, lapNumber: 99 })).rejects.toThrow(NotFoundError);
  });

  it('sessão que não existe é "não encontrada"', async () => {
    const query = createGetLapSeriesQuery({ sessions: leitor({ findById: async () => null }) });

    await expect(query({ sessionId: session.id, lapNumber: 3 })).rejects.toThrow(NotFoundError);
  });
});
