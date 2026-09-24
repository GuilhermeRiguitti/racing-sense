import { describe, expect, it } from 'vitest';
import { createChannelSeries } from './channel.js';
import { InvariantError } from './errors.js';

describe('createChannelSeries', () => {
  it('aceita série com x e y do mesmo tamanho', () => {
    const series = createChannelSeries({
      channel: 'Brake',
      unit: '%',
      type: 'number',
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
        type: 'number',
        axis: 'time',
        x: [0, 1, 2],
        y: [0, 1],
      }),
    ).toThrow(InvariantError);
  });

  it('aceita a distância levemente negativa que o sim reporta logo depois da linha', () => {
    // Valor real, de uma volta válida em Suzuka. Recusar isto seria rejeitar
    // dado correto por causa de uma suposição sobre a faixa.
    const serie = createChannelSeries({
      channel: 'Speed',
      unit: 'm/s',
      type: 'number',
      axis: 'lapDistPct',
      x: [-0.0000129, 0.5, 0.99994],
      y: [60, 40, 62],
    });

    expect(serie.x[0]).toBe(-0.0000129);
  });

  it('recusa eixo com valor não finito', () => {
    expect(() =>
      createChannelSeries({
        channel: 'Speed',
        unit: 'm/s',
        type: 'number',
        axis: 'lapDistPct',
        x: [0, Number.NaN],
        y: [10, 20],
      }),
    ).toThrow(InvariantError);
  });
});
