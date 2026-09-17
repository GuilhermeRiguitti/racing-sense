import { describe, expect, it } from 'vitest';
import { InvariantError } from '../shared/errors.js';
import { aLap } from '../testing/factories.js';
import { isComparable, lapDurationSeconds } from './lap.js';

describe('lapDurationSeconds', () => {
  it('deriva a duração dos índices de amostra', () => {
    expect(lapDurationSeconds(aLap({ startSample: 600, endSample: 5100 }), 60)).toBe(75);
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

describe('isComparable', () => {
  it('rejeita volta incompleta (out lap, in lap, gravação cortada)', () => {
    expect(isComparable(aLap({ isComplete: false }))).toBe(false);
    expect(isComparable(aLap({ lapTimeSeconds: null }))).toBe(false);
    expect(isComparable(aLap())).toBe(true);
  });
});
