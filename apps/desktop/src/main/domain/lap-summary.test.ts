import { describe, expect, it } from 'vitest';
import { summarizeLap, summarizeSeries } from './lap-summary.js';
import { aSeries } from '../../../tests/support/builders.js';

describe('summarizeSeries', () => {
  it('resume primeira, última, mínimo, máximo e média das amostras', () => {
    const resumo = summarizeSeries(
      aSeries({ channel: 'FuelLevel', unit: 'l', x: [0, 0.5, 1], y: [40, 39.5, 39] }),
    );

    expect(resumo).toEqual({
      channel: 'FuelLevel',
      unit: 'l',
      type: 'number',
      first: 40,
      last: 39,
      min: 39,
      max: 40,
      mean: 39.5,
    });
  });

  it('booleano tem média: a fração do tempo em que esteve ligado', () => {
    const resumo = summarizeSeries(
      aSeries({ channel: 'BrakeABSactive', type: 'boolean', x: [0, 0.3, 0.6, 1], y: [0, 1, 1, 0] }),
    );

    expect(resumo?.mean).toBe(0.5);
  });

  it('bitfield não tem média: a média de uma máscara não é valor possível', () => {
    const resumo = summarizeSeries(
      aSeries({ channel: 'EngineWarnings', type: 'bitfield', x: [0, 1], y: [1, 4] }),
    );

    expect(resumo?.mean).toBeNull();
    expect(resumo?.max).toBe(4);
  });

  it('série vazia não tem resumo, em vez de zeros', () => {
    expect(summarizeSeries(aSeries({ x: [], y: [] }))).toBeNull();
  });
});

describe('summarizeLap', () => {
  it('pula as séries vazias', () => {
    const resumos = summarizeLap([aSeries(), aSeries({ channel: 'RPM', x: [], y: [] })]);

    expect(resumos.map((r) => r.channel)).toEqual(['Speed']);
  });
});
