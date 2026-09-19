import { describe, expect, it } from 'vitest';
import { InvariantError } from '../shared/errors.js';
import { aLap } from '../testing/factories.js';
import { isValidLap, lapDurationSeconds } from './lap.js';

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
