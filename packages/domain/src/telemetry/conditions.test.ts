import { describe, expect, it } from 'vitest';
import {
  compareConditions,
  type SessionConditions,
  SIGNIFICANT_TRACK_TEMP_DELTA,
  UNKNOWN_CONDITIONS,
} from './conditions.js';

const condicoes = (overrides: Partial<SessionConditions> = {}): SessionConditions => ({
  ...UNKNOWN_CONDITIONS,
  airTempCelsius: 25,
  trackTempCelsius: 32,
  ...overrides,
});

describe('compareConditions', () => {
  it('mede a diferença de pista e de ar', () => {
    const gap = compareConditions(
      condicoes(),
      condicoes({ trackTempCelsius: 38, airTempCelsius: 28 }),
    );

    expect(gap.trackTempDeltaCelsius).toBe(6);
    expect(gap.airTempDeltaCelsius).toBe(3);
  });

  it('marca como relevante a diferença que explica tempo sozinha', () => {
    const grande = compareConditions(
      condicoes(),
      condicoes({ trackTempCelsius: 32 + SIGNIFICANT_TRACK_TEMP_DELTA }),
    );
    const pequena = compareConditions(condicoes(), condicoes({ trackTempCelsius: 33 }));

    expect(grande.isSignificant).toBe(true);
    expect(pequena.isSignificant).toBe(false);
  });

  it('não inventa diferença quando o dado não existe', () => {
    const gap = compareConditions(UNKNOWN_CONDITIONS, condicoes());

    expect(gap.trackTempDeltaCelsius).toBeNull();
    expect(gap.isSignificant).toBe(false);
  });
});
