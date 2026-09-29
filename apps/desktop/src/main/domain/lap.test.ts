import { describe, expect, it } from 'vitest';
import { InvariantError } from './errors.js';
import { countsForSession, isValidLap, lapDurationSeconds, stretchesWhere } from './lap.js';
import { aLap } from '../../../tests/support/builders.js';

describe('lapDurationSeconds', () => {
  it('deriva a duração dos índices de amostra', () => {
    expect(lapDurationSeconds(aLap({ startSample: 600, endSample: 5099 }), 60)).toBe(75);
  });

  it('recusa tickRate inválido em vez de devolver Infinity', () => {
    expect(() => lapDurationSeconds(aLap(), 0)).toThrow(InvariantError);
  });

  it('recusa volta com fim antes do início', () => {
    expect(() => lapDurationSeconds(aLap({ startSample: 900, endSample: 300 }), 60)).toThrow(
      InvariantError,
    );
  });
});

describe('isValidLap', () => {
  it('rejeita volta incompleta (out lap, in lap, gravação cortada)', () => {
    expect(isValidLap(aLap({ flags: ['incomplete'] }))).toBe(false);
    expect(isValidLap(aLap({ lapTimeSeconds: null }))).toBe(false);
    expect(isValidLap(aLap())).toBe(true);
  });

  it('rejeita volta marcada, mesmo completa e cronometrada', () => {
    expect(isValidLap(aLap({ flags: ['off-track'] }))).toBe(false);
    expect(isValidLap(aLap({ flags: ['pit'] }))).toBe(false);
  });
});

describe('stretchesWhere', () => {
  const posicoes = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];

  it('devolve cada sequência verdadeira como um trecho, na posição medida', () => {
    const ativo = [false, true, true, false, true, false];

    expect(stretchesWhere(posicoes, ativo)).toEqual([
      { startPct: 0.2, endPct: 0.3 },
      { startPct: 0.5, endPct: 0.5 },
    ]);
  });

  it('fecha o trecho que vai até a última amostra', () => {
    expect(stretchesWhere(posicoes, [false, false, false, false, true, true])).toEqual([
      { startPct: 0.5, endPct: 0.6 },
    ]);
  });

  it('não junta trechos vizinhos nem descarta trecho de uma amostra', () => {
    expect(stretchesWhere(posicoes, [true, false, true, false, true, false])).toHaveLength(3);
  });

  it('recusa sinal de tamanho diferente das posições', () => {
    expect(() => stretchesWhere(posicoes, [true])).toThrow(InvariantError);
  });
});

describe('countsForSession', () => {
  it('saída de pista sem punição conta na sessão, mas não serve de referência', () => {
    const volta = aLap({ flags: ['off-track'] });

    expect(countsForSession(volta)).toBe(true);
    expect(isValidLap(volta)).toBe(false);
  });

  it('slow down, box e volta cortada ficam fora da sessão', () => {
    expect(countsForSession(aLap({ flags: ['off-track', 'slowdown'] }))).toBe(false);
    expect(countsForSession(aLap({ flags: ['pit'] }))).toBe(false);
    expect(countsForSession(aLap({ flags: ['incomplete'], isComplete: false }))).toBe(false);
  });

  it('volta sem tempo cronometrado não conta', () => {
    expect(countsForSession(aLap({ lapTimeSeconds: null }))).toBe(false);
  });
});
