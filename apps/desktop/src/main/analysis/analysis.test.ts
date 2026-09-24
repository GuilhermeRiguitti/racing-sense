import { describe, expect, it, vi } from 'vitest';
import { openLocalStore } from '../db/local-store.js';
import {
  IncompatibleReferenceError,
  InvalidRequestError,
  InvariantError,
  NotFoundError,
} from '../domain/errors.js';
import { toReferenceLapId, toSessionId } from '../domain/id.js';
import type { Lap } from '../domain/lap.js';
import type { ReferenceLap } from '../domain/reference-lap.js';
import { aCar, aLap, aReferenceLap, aSeries, aSession } from '../domain/testing.js';
import { compareLapToReference } from './compare-lap.js';
import { getLapSeries, listSessionLaps } from './laps.js';
import type { Narrate } from './narrator.js';
import { importReferenceLap } from './reference-laps.js';
import { getLapAnalysis, requestLapAnalysis } from './request-lap-analysis.js';

const session = aSession();
// Três amostras em [0, 0,5, 1] (`aSeries`), um tick cada.
const volta = aLap({ number: 3, startSample: 0, endSample: 2, lapTimeSeconds: 3 / 60 });
const regua = aReferenceLap({
  lap: aLap({ startSample: 0, endSample: 2, lapTimeSeconds: 3 / 60 }),
});

/** Banco com uma sessão, as voltas pedidas (com série) e uma referência. */
function banco({
  laps = [volta],
  sessao = session,
  referencia = regua,
}: {
  laps?: Lap[];
  sessao?: typeof session;
  referencia?: ReferenceLap;
} = {}) {
  const store = openLocalStore(':memory:');
  store.saveRecording({
    session: sessao,
    laps,
    seriesByLap: new Map(laps.map((lap) => [lap.number, [aSeries()]])),
  });
  store.saveReferenceLap(referencia);
  return store;
}

const pedido = { sessionId: session.id, lapNumber: 3, referenceLapId: regua.id };

describe('listSessionLaps e getLapSeries', () => {
  it('lista as voltas e devolve as séries gravadas', () => {
    const store = banco();

    expect(listSessionLaps(store, session.id)).toHaveLength(1);
    expect(getLapSeries(store, session.id, 3)).toHaveLength(1);
  });

  it('serve volta inválida: mostrar não é analisar', () => {
    const store = banco({ laps: [{ ...volta, flags: ['off-track'] }] });

    expect(getLapSeries(store, session.id, 3)).toHaveLength(1);
  });

  it('distingue sessão inexistente de sessão sem voltas', () => {
    const store = banco({ laps: [] });

    expect(listSessionLaps(store, session.id)).toEqual([]);
    expect(() => listSessionLaps(store, toSessionId('sumiu'))).toThrow(NotFoundError);
    expect(() => getLapSeries(store, toSessionId('sumiu'), 3)).toThrow(NotFoundError);
    expect(() => getLapSeries(store, session.id, 42)).toThrow(NotFoundError);
  });
});

describe('compareLapToReference', () => {
  it('devolve o delta da volta contra a referência', () => {
    const comparacao = compareLapToReference(banco(), pedido);

    expect(comparacao.totalDeltaSeconds).toBe(0);
    expect(comparacao.deltaSeries.y).toEqual([0, 0, 0]);
    expect(comparacao.referenceLapId).toBe(regua.id);
  });

  it('recusa volta inválida nomeando o motivo (ADR 0018)', () => {
    const store = banco({ laps: [{ ...volta, flags: ['off-track'] }] });

    expect(() => compareLapToReference(store, pedido)).toThrow(InvalidRequestError);
    expect(() => compareLapToReference(store, pedido)).toThrow(/off-track/);
  });

  it('recusa referência de outro carro', () => {
    const store = banco({ sessao: aSession({ car: aCar({ id: 'mx5' }) }) });

    expect(() => compareLapToReference(store, pedido)).toThrow(IncompatibleReferenceError);
  });

  it('referência que não existe é "não encontrada"', () => {
    expect(() =>
      compareLapToReference(banco(), { ...pedido, referenceLapId: toReferenceLapId('sumiu') }),
    ).toThrow(NotFoundError);
  });
});

describe('importReferenceLap', () => {
  it('promove a volta válida a referência, com as séries dela', () => {
    const store = banco();

    const id = importReferenceLap(store, { sessionId: session.id, lapNumber: 3, label: 'Treino' });

    expect(store.findReferenceLap(id)).toMatchObject({ label: 'Treino', origin: 'session-lap' });
    expect(store.findReferenceLap(id)?.series).toHaveLength(1);
  });

  it('volta com saída de pista não vira régua', () => {
    const store = banco({ laps: [{ ...volta, flags: ['off-track'] }] });

    expect(() =>
      importReferenceLap(store, { sessionId: session.id, lapNumber: 3, label: 'x' }),
    ).toThrow(/não serve de referência \(off-track\)/);
  });
});

describe('requestLapAnalysis', () => {
  const narrador = (): Narrate & ReturnType<typeof vi.fn> =>
    vi.fn(async () => ({ summary: 'Resumo', findings: [], model: 'fake' }));

  it('o narrador recebe o delta já calculado, e o relatório é gravado', async () => {
    // Volta de 3 amostras, 3 ticks mais lenta que a referência de mesma forma.
    const store = banco({
      laps: [aLap({ number: 3, startSample: 0, endSample: 2, lapTimeSeconds: 6 / 60 })],
    });
    const narrate = narrador();
    const emit = vi.fn();

    await requestLapAnalysis({ store, narrate, emit }, pedido);

    const [recebido] = narrate.mock.calls[0] ?? [];
    expect(recebido?.comparison.totalDeltaSeconds).toBeCloseTo(3 / 60, 12);
    expect(recebido?.comparison.deltaSeries.x).toEqual([0, 0.5, 1]);
    expect(getLapAnalysis(store, pedido)).toMatchObject({ summary: 'Resumo', model: 'fake' });
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'analysis-ready', lapNumber: 3 }),
    );
  });

  it('recusa volta com saída de pista antes de gastar chamada de modelo', async () => {
    const store = banco({ laps: [{ ...volta, flags: ['off-track'] }] });
    const narrate = narrador();

    await expect(requestLapAnalysis({ store, narrate, emit: vi.fn() }, pedido)).rejects.toThrow(
      /off-track/,
    );
    expect(narrate).not.toHaveBeenCalled();
  });

  it('recusa volta cortada pela gravação', async () => {
    const store = banco({ laps: [{ ...volta, flags: ['incomplete'], lapTimeSeconds: null }] });

    await expect(
      requestLapAnalysis({ store, narrate: narrador(), emit: vi.fn() }, pedido),
    ).rejects.toThrow(/incomplete/);
  });

  it('delta que não fecha não chega ao narrador', async () => {
    // A volta diz 4501 amostras; a série gravada tem 3. Falha no domínio.
    const store = banco({ laps: [aLap({ number: 3 })] });
    const narrate = narrador();
    const emit = vi.fn();

    await expect(requestLapAnalysis({ store, narrate, emit }, pedido)).rejects.toThrow(
      InvariantError,
    );
    expect(narrate).not.toHaveBeenCalled();
    expect(() => getLapAnalysis(store, pedido)).toThrow(NotFoundError);
    expect(emit).not.toHaveBeenCalled();
  });

  it('falha cedo quando a sessão, a referência ou a volta não existem', async () => {
    const store = banco();
    const narrate = narrador();
    const ctx = { store, narrate, emit: vi.fn() };

    await expect(
      requestLapAnalysis(ctx, { ...pedido, sessionId: toSessionId('sumiu') }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      requestLapAnalysis(ctx, { ...pedido, referenceLapId: toReferenceLapId('sumiu') }),
    ).rejects.toThrow(NotFoundError);
    await expect(requestLapAnalysis(ctx, { ...pedido, lapNumber: 42 })).rejects.toThrow(
      NotFoundError,
    );
    expect(narrate).not.toHaveBeenCalled();
  });
});
