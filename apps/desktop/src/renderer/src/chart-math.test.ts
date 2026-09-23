import { describe, expect, it } from 'vitest';
import { formatLapTime, nearestIndex, niceCeil, niceTicks, seriesPath } from './chart-math.js';

describe('niceTicks', () => {
  it('produz marcações redondas', () => {
    expect(niceTicks(0, 250, 5)).toEqual([0, 50, 100, 150, 200, 250]);
    expect(niceTicks(0, 100, 4)).toEqual([0, 50, 100]);
  });

  it('não acumula erro de ponto flutuante', () => {
    for (const tick of niceTicks(0, 1, 10)) {
      expect(String(tick).length).toBeLessThanOrEqual(3);
    }
  });

  it('faixa degenerada não trava', () => {
    expect(niceTicks(5, 5, 4)).toEqual([5]);
  });
});

describe('niceCeil', () => {
  it('arredonda para cima no passo das marcações', () => {
    expect(niceCeil(241.09)).toBe(300);
    expect(niceCeil(251.7)).toBe(300);
    expect(niceCeil(7400)).toBe(8000);
    expect(niceCeil(0)).toBe(0);
  });

  it('não desperdiça metade do painel: 252 km/h não vira 500', () => {
    expect(niceCeil(252)).toBeLessThan(400);
  });
});

describe('nearestIndex', () => {
  it('acha a amostra mais perto num eixo crescente', () => {
    expect(nearestIndex([0, 0.1, 0.2, 0.3], 0.14)).toBe(1);
    expect(nearestIndex([0, 0.1, 0.2, 0.3], 0.16)).toBe(2);
    expect(nearestIndex([0, 0.1, 0.2, 0.3], 5)).toBe(3);
    expect(nearestIndex([0, 0.1, 0.2, 0.3], -1)).toBe(0);
  });

  it('eixo com trecho parado (carro no box) continua achando o ponto', () => {
    expect(nearestIndex([0.07, 0.07, 0.07, 0.08, 0.09], 0.082)).toBe(3);
  });

  it('eixo que anda para trás não devolve ponto errado', () => {
    expect(nearestIndex([0.5, 0.4, 0.9, 0.1], 0.12)).toBe(3);
  });

  it('série vazia não tem ponto', () => {
    expect(nearestIndex([], 0.5)).toBe(-1);
  });
});

describe('formatLapTime', () => {
  it('formata como o sim mostra', () => {
    expect(formatLapTime(105.467)).toBe('1:45.467');
    expect(formatLapTime(123.8333)).toBe('2:03.833');
    expect(formatLapTime(59.9)).toBe('0:59.900');
  });

  it('sem tempo é um traço, não zero', () => {
    expect(formatLapTime(null)).toBe('—');
  });
});

describe('seriesPath', () => {
  const identidade = (v: number) => v;

  it('contínuo liga os pontos com reta', () => {
    expect(seriesPath([0, 10], [5, 7], identidade, identidade, false)).toBe('M0.0,5.0L10.0,7.0');
  });

  it('discreto desenha degrau, sem passar por valor intermediário', () => {
    expect(seriesPath([0, 10], [3, 4], identidade, identidade, true)).toBe('M0.0,3.0H10.0V4.0');
  });
});
