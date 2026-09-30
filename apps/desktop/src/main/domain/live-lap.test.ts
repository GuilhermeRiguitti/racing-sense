import { describe, expect, it } from 'vitest';
import { appendLiveSample, createLiveLap, type LiveLapSample } from './live-lap.js';

let tickCount = 0;
const sample = (lap: number, lapDistPct: number, value = lapDistPct): LiveLapSample => {
  tickCount += 1;
  return { tickCount, lap, lapDistPct, values: [value] };
};

function feed(samples: LiveLapSample[]) {
  const state = createLiveLap();
  for (const s of samples) appendLiveSample(state, s);
  return state;
}

describe('volta ao vivo', () => {
  it('a volta em que a tela abriu é um pedaço, não vira anterior', () => {
    const state = feed([sample(3, 0.5), sample(3, 0.9), sample(4, 0.01), sample(4, 0.2)]);

    expect(state.current?.lap).toBe(4);
    expect(state.current?.fromLine).toBe(true);
    expect(state.previous).toBeNull();
  });

  it('volta inteira vira a anterior ao cruzar a linha', () => {
    const state = feed([
      sample(3, 0.9),
      sample(4, 0.01),
      sample(4, 0.5),
      sample(4, 0.99),
      sample(5, 0.02),
    ]);

    expect(state.previous?.lap).toBe(4);
    expect(state.previous?.x).toEqual([0.01, 0.5, 0.99]);
    expect(state.current?.x).toEqual([0.02]);
  });

  it('número que sobe antes da distância virar: a linha é o primeiro recuo', () => {
    const state = feed([sample(3, 0.9), sample(3, 0.998), sample(4, 0.999), sample(4, 0.003)]);

    expect(state.current?.lap).toBe(4);
    expect(state.current?.x).toEqual([0.003]);
  });

  it('ponto que anda para trás no meio da volta não entra', () => {
    const state = feed([sample(3, 0.4), sample(3, 0.5), sample(3, 0.45), sample(3, 0.6)]);

    expect(state.current?.x).toEqual([0.4, 0.5, 0.6]);
  });

  it('fora do mundo não é ponto', () => {
    const state = feed([sample(3, 0.4), sample(3, -1), sample(3, 0.5)]);

    expect(state.current?.x).toEqual([0.4, 0.5]);
  });

  it('volta que recua é sessão nova: recomeça sem anterior', () => {
    const state = feed([sample(3, 0.9), sample(4, 0.1), sample(4, 0.99), sample(5, 0.01), sample(1, 0.3)]);

    expect(state.current?.lap).toBe(1);
    expect(state.previous).toBeNull();
  });
});
