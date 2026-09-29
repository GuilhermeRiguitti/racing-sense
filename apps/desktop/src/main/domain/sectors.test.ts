import { describe, expect, it } from 'vitest';
import { firstArrivals } from './arrivals.js';
import { InvariantError } from './errors.js';
import { isValidSectorStarts, sectorTimes } from './sectors.js';
import { aLap } from '../../../tests/support/builders.js';

const TICK = 60;

/** Uma volta como a ingestão grava: uma posição por tick, tempo pela contagem. */
const chegadas = (posicoes: readonly number[]) =>
  firstArrivals(
    aLap({ startSample: 0, endSample: posicoes.length - 1, lapTimeSeconds: posicoes.length / TICK }),
    posicoes,
  );

/** Posições de quem anda a passo constante: `n` ticks do começo ao fim. */
const constante = (n: number) => Array.from({ length: n }, (_, k) => k / n);

describe('isValidSectorStarts', () => {
  it('aceita setores que começam na linha e crescem antes de fechar a volta', () => {
    expect(isValidSectorStarts([0, 0.167875, 0.442307, 0.787105])).toBe(true);
    expect(isValidSectorStarts([0])).toBe(true);
  });

  it('recusa lista vazia, que não começa na linha, que não cresce ou que chega a 1', () => {
    expect(isValidSectorStarts([])).toBe(false);
    expect(isValidSectorStarts([0.1, 0.5])).toBe(false);
    expect(isValidSectorStarts([0, 0.5, 0.5])).toBe(false);
    expect(isValidSectorStarts([0, 0.6, 0.4])).toBe(false);
    expect(isValidSectorStarts([0, 1])).toBe(false);
  });
});

describe('sectorTimes', () => {
  it('a soma dos setores é o tempo de volta', () => {
    const volta = chegadas(constante(4500));

    const tempos = sectorTimes(volta, [0, 0.167875, 0.442307, 0.787105]);

    expect(tempos.every((tempo) => tempo !== null && tempo > 0)).toBe(true);
    const soma = tempos.reduce((total, tempo) => (total ?? 0) + (tempo ?? 0), 0);
    expect(soma).toBeCloseTo(4500 / TICK, 9);
  });

  it('a passagem pela divisa é interpolada entre os dois ticks vizinhos', () => {
    // 10 ticks, um a cada 0,1: a divisa em 0,25 cai no meio entre o tick 2 e o 3.
    const tempos = sectorTimes(chegadas(constante(10)), [0, 0.25]);

    expect(tempos[0]).toBeCloseTo(2.5 / TICK, 12);
    expect(tempos[1]).toBeCloseTo(7.5 / TICK, 12);
  });

  it('pista de um setor só: o setor é a volta inteira', () => {
    expect(sectorTimes(chegadas(constante(120)), [0])).toEqual([2]);
  });

  it('carro que andou para trás não conta a mesma passagem duas vezes', () => {
    // Rodou depois de 0,3, voltou a 0,2 e seguiu. A divisa em 0,25 conta na
    // primeira vez que ele passou por ela.
    const posicoes = [0, 0.1, 0.2, 0.3, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

    const tempos = sectorTimes(chegadas(posicoes), [0, 0.25]);

    expect(tempos[0]).toBeCloseTo(2.5 / TICK, 12);
  });

  it('divisa que a volta não amostrou fica sem tempo, nunca extrapolada', () => {
    // A gravação da volta só vai até 0,5: o setor que começa em 0,75 não tem começo.
    const posicoes = Array.from({ length: 60 }, (_, k) => k / 120);

    const tempos = sectorTimes(chegadas(posicoes), [0, 0.25, 0.75]);

    expect(tempos[0]).not.toBeNull();
    expect(tempos[1]).toBeNull();
    expect(tempos[2]).toBeNull();
  });

  it('setores fora de forma falham alto', () => {
    expect(() => sectorTimes(chegadas(constante(10)), [0.2, 0.5])).toThrow(InvariantError);
  });
});
