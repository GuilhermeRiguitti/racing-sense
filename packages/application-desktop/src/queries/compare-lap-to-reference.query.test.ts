import { InvalidRequestError } from '@telemetry/application';
import { IncompatibleReferenceError, NotFoundError } from '@telemetry/domain';
import { aCar, aLap, aReferenceLap, aSeries, aSession } from '@telemetry/domain/testing';
import { describe, expect, it } from 'vitest';
import type { ReferenceLapReaderPort } from '../ports/reference-lap-store.port.js';
import type { SessionReaderPort } from '../ports/session-store.port.js';
import { createCompareLapToReferenceQuery } from './compare-lap-to-reference.query.js';

const session = aSession();
// Três amostras em [0, 0,5, 1] (`aSeries`), um tick cada.
const volta = aLap({ number: 3, startSample: 0, endSample: 2, lapTimeSeconds: 3 / 60 });
const reference = aReferenceLap({
  lap: aLap({ startSample: 0, endSample: 2, lapTimeSeconds: 3 / 60 }),
});

const leitor = (overrides: Partial<SessionReaderPort> = {}): SessionReaderPort => ({
  list: async () => [session],
  findById: async () => session,
  listLaps: async () => [volta],
  readLapSeries: async () => [aSeries()],
  ...overrides,
});

const referencias = (overrides: Partial<ReferenceLapReaderPort> = {}): ReferenceLapReaderPort => ({
  list: async () => [reference],
  findById: async () => reference,
  ...overrides,
});

const pedido = { sessionId: session.id, lapNumber: 3, referenceLapId: reference.id };

describe('CompareLapToReference', () => {
  it('devolve o delta da volta contra a referência', async () => {
    const query = createCompareLapToReferenceQuery({
      sessions: leitor(),
      referenceLaps: referencias(),
    });

    const comparacao = await query(pedido);

    expect(comparacao.totalDeltaSeconds).toBe(0);
    expect(comparacao.deltaSeries.y).toEqual([0, 0, 0]);
    expect(comparacao.referenceLapId).toBe(reference.id);
  });

  it('recusa volta inválida nomeando o motivo (ADR 0018)', async () => {
    const query = createCompareLapToReferenceQuery({
      sessions: leitor({ listLaps: async () => [{ ...volta, flags: ['off-track'] }] }),
      referenceLaps: referencias(),
    });

    await expect(query(pedido)).rejects.toThrow(InvalidRequestError);
    await expect(query(pedido)).rejects.toThrow(/off-track/);
  });

  it('recusa referência de outro carro', async () => {
    const query = createCompareLapToReferenceQuery({
      sessions: leitor({ findById: async () => aSession({ car: aCar({ id: 'mx5' }) }) }),
      referenceLaps: referencias(),
    });

    await expect(query(pedido)).rejects.toThrow(IncompatibleReferenceError);
  });

  it('referência que não existe é "não encontrada"', async () => {
    const query = createCompareLapToReferenceQuery({
      sessions: leitor(),
      referenceLaps: referencias({ findById: async () => null }),
    });

    await expect(query(pedido)).rejects.toThrow(NotFoundError);
  });
});
