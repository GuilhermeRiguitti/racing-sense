import { describe, expect, it } from 'vitest';
import { InvariantError } from '../shared/errors.js';
import { createChannelSeries } from './channel.js';

describe('createChannelSeries', () => {
  it('aceita série com x e y do mesmo tamanho', () => {
    const series = createChannelSeries({
      channel: 'Brake',
      unit: '%',
      axis: 'lapDistPct',
      x: [0, 0.5, 1],
      y: [0, 0.8, 0],
    });

    expect(series.y).toHaveLength(series.x.length);
  });

  it('recusa série desalinhada em vez de gerar gráfico torto', () => {
    expect(() =>
      createChannelSeries({
        channel: 'Brake',
        unit: '%',
        axis: 'time',
        x: [0, 1, 2],
        y: [0, 1],
      }),
    ).toThrow(InvariantError);
  });

  it('recusa distância fora de [0, 1]', () => {
    expect(() =>
      createChannelSeries({
        channel: 'Speed',
        unit: 'm/s',
        axis: 'lapDistPct',
        x: [0, 1.4],
        y: [10, 20],
      }),
    ).toThrow(InvariantError);
  });
});
