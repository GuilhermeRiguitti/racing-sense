import { describe, expect, it } from 'vitest';
import { type ChannelType, createChannelSeries } from './channel.js';
import { downsample, toDistanceSeries } from './distance-series.js';
import { InvariantError } from './errors.js';

const serieDeTempo = (y: readonly number[], type: ChannelType = 'number') =>
  createChannelSeries({
    channel: type === 'number' ? 'Speed' : 'Gear',
    unit: type === 'number' ? 'm/s' : '',
    type,
    axis: 'time',
    x: y.map((_, i) => i / 60),
    y,
  });

describe('toDistanceSeries', () => {
  it('coloca a série numa grade uniforme de distância', () => {
    const serie = serieDeTempo([0, 10, 20, 30, 40]);
    const posicoes = [0, 0.25, 0.5, 0.75, 1];

    const saida = toDistanceSeries(serie, posicoes, 5);

    expect(saida.axis).toBe('lapDistPct');
    expect(saida.x).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(saida.y).toEqual([0, 10, 20, 30, 40]);
  });

  it('interpola quando a grade cai entre duas amostras', () => {
    // Amostras a cada 50% da pista; a grade pede 25% e 75%.
    const saida = toDistanceSeries(serieDeTempo([0, 100, 200]), [0, 0.5, 1], 5);

    expect(saida.y).toEqual([0, 50, 100, 150, 200]);
  });

  it('reamostra voltas de durações diferentes para a mesma grade', () => {
    // É isto que torna duas voltas somáveis ponto a ponto: quem freia mais tarde
    // tem mais amostras no mesmo trecho, e no eixo distância elas se alinham.
    const rapida = toDistanceSeries(serieDeTempo([0, 50, 100]), [0, 0.5, 1], 11);
    const lenta = toDistanceSeries(serieDeTempo([0, 25, 50, 75, 100]), [0, 0.25, 0.5, 0.75, 1], 11);

    expect(rapida.x).toEqual(lenta.x);
    expect(rapida.y).toEqual(lenta.y);
  });

  it('não inventa pista que a gravação não cobriu', () => {
    // Volta cortada: o piloto saiu do carro na metade do traçado.
    const saida = toDistanceSeries(serieDeTempo([0, 10, 20]), [0, 0.25, 0.5], 11);

    expect(Math.max(...saida.x)).toBeLessThanOrEqual(0.5);
    expect(saida.x.length).toBeLessThan(11);
  });

  it('não inventa marcha entre duas marchas', () => {
    // O bug que a interpolação linear produzia numa volta real: 3,66ª marcha.
    const saida = toDistanceSeries(serieDeTempo([3, 4, 4, 5], 'integer'), [0, 0.3, 0.6, 0.9], 10);

    for (const marcha of saida.y) {
      expect(Number.isInteger(marcha)).toBe(true);
    }
    // Entre 0% e 30% a marcha era 3; em 20% continua 3, não 3,67.
    expect(saida.y[2]).toBe(3);
  });

  it('booleano continua sendo 0 ou 1 depois de reamostrado', () => {
    const saida = toDistanceSeries(serieDeTempo([0, 1, 1, 0], 'boolean'), [0, 0.3, 0.6, 0.9], 20);

    expect(new Set(saida.y)).toEqual(new Set([0, 1]));
  });

  it('recusa série e posições de tamanhos diferentes', () => {
    expect(() => toDistanceSeries(serieDeTempo([1, 2, 3]), [0, 1], 10)).toThrow(InvariantError);
  });

  it('recusa resolução que não forma grade', () => {
    expect(() => toDistanceSeries(serieDeTempo([1, 2]), [0, 1], 1)).toThrow(InvariantError);
  });
});

describe('downsample', () => {
  it('devolve a série intacta quando ela já cabe no alvo', () => {
    const serie = serieDeTempo([1, 2, 3]);

    expect(downsample(serie, 10)).toBe(serie);
  });

  it('preserva o pico de frenagem — o motivo de não usar média', () => {
    // 600 amostras planas com um pico de um tick só, como uma frenagem forte.
    const y = Array.from({ length: 600 }, () => 10);
    y[301] = 95;

    const reduzida = downsample(serieDeTempo(y), 40);

    expect(Math.max(...reduzida.y)).toBe(95);
    expect(reduzida.y.length).toBeLessThanOrEqual(42);
  });

  it('preserva também o vale, não só o pico', () => {
    const y = Array.from({ length: 600 }, () => 50);
    y[100] = 0;
    y[500] = 100;

    const reduzida = downsample(serieDeTempo(y), 40);

    expect(Math.min(...reduzida.y)).toBe(0);
    expect(Math.max(...reduzida.y)).toBe(100);
  });

  it('mantém as pontas e a ordem do eixo', () => {
    const y = Array.from({ length: 500 }, (_, i) => Math.sin(i / 10) * 100);
    const serie = serieDeTempo(y);

    const reduzida = downsample(serie, 50);

    expect(reduzida.x[0]).toBe(serie.x[0]);
    expect(reduzida.x.at(-1)).toBe(serie.x.at(-1));
    for (let i = 1; i < reduzida.x.length; i += 1) {
      expect(reduzida.x[i] as number).toBeGreaterThan(reduzida.x[i - 1] as number);
    }
  });

  it('recusa alvo que não desenha nada', () => {
    expect(() => downsample(serieDeTempo([1, 2, 3]), 1)).toThrow(InvariantError);
  });
});
