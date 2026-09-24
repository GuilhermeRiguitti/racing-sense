import { describe, expect, it } from 'vitest';
import { createChannelSeries } from './channel.js';
import { IncompatibleReferenceError, InvariantError } from './errors.js';
import { compareToReference, DELTA_CHANNEL } from './lap-comparison.js';
import { aCar, aLap, aReferenceLap, aTrack } from './testing.js';

const TICK = 60;

/**
 * Uma volta como a ingestão grava: uma posição por tick, e o tempo de volta é a
 * contagem de ticks (`detectLaps`).
 */
const umaVolta = (posicoes: readonly number[], number = 3) => ({
  lap: aLap({
    number,
    startSample: 1000,
    endSample: 1000 + posicoes.length - 1,
    lapTimeSeconds: posicoes.length / TICK,
  }),
  series: [
    createChannelSeries({
      channel: 'Speed',
      unit: 'm/s',
      type: 'number',
      axis: 'lapDistPct',
      x: posicoes,
      y: posicoes.map(() => 50),
    }),
  ],
});

/** Posições de quem anda a passo constante: `n` ticks do começo ao fim. */
const constante = (n: number) => Array.from({ length: n }, (_, k) => k / n);

const referenciaDe = (posicoes: readonly number[]) => {
  const { lap, series } = umaVolta(posicoes, 7);
  return aReferenceLap({ lap, series });
};

const alvoDe = (posicoes: readonly number[], sectorStartPcts: readonly number[] | null = null) => ({
  track: aTrack(),
  car: aCar(),
  ...umaVolta(posicoes),
  sectorStartPcts,
});

describe('compareToReference', () => {
  it('volta contra ela mesma: delta zero em toda a extensão', () => {
    // O critério de pronto da etapa 3. É o teste que pega erro de alinhamento.
    const posicoes = constante(600);

    const comparacao = compareToReference(referenciaDe(posicoes), alvoDe(posicoes));

    expect(comparacao.totalDeltaSeconds).toBe(0);
    expect(comparacao.deltaSeries.x).toHaveLength(600);
    expect(comparacao.deltaSeries.y.every((delta) => delta === 0)).toBe(true);
  });

  it('série de delta em segundos, no eixo distância', () => {
    const comparacao = compareToReference(referenciaDe(constante(60)), alvoDe(constante(60)));

    expect(comparacao.deltaSeries).toMatchObject({
      channel: DELTA_CHANNEL,
      unit: 's',
      type: 'number',
      axis: 'lapDistPct',
    });
    expect(comparacao.lapNumber).toBe(3);
  });

  it('perde tempo só onde andou mais devagar', () => {
    // Primeira metade igual à referência; na segunda, metade da velocidade.
    const referencia = constante(120);
    const alvo = [
      ...Array.from({ length: 60 }, (_, k) => k / 120),
      ...Array.from({ length: 120 }, (_, k) => 0.5 + k / 240),
    ];

    const comparacao = compareToReference(referenciaDe(referencia), alvoDe(alvo));
    const deltaEm = (posicao: number) =>
      comparacao.deltaSeries.y[comparacao.deltaSeries.x.indexOf(posicao)];

    expect(deltaEm(0.25)).toBeCloseTo(0, 12);
    expect(deltaEm(0.5)).toBeCloseTo(0, 12);
    // A 75% a referência levou 90 ticks; a volta, 60 + 60.
    expect(deltaEm(0.75)).toBeCloseTo(30 / TICK, 12);
    expect(comparacao.totalDeltaSeconds).toBeCloseTo(60 / TICK, 12);
  });

  it('volta mais rápida dá delta negativo', () => {
    const comparacao = compareToReference(referenciaDe(constante(120)), alvoDe(constante(100)));

    expect(comparacao.totalDeltaSeconds).toBeCloseTo(-20 / TICK, 12);
    expect(comparacao.deltaSeries.y.at(-1)).toBeLessThan(0);
  });

  it('interpola o tempo da referência entre dois ticks', () => {
    // Referência amostrada a cada 10%; a volta passa por 5% no tick 1.
    const referencia = [0, 0.1, 0.2, 0.3];
    const alvo = [0, 0.05, 0.3];

    const comparacao = compareToReference(referenciaDe(referencia), alvoDe(alvo));

    // A referência chegou a 5% na metade entre o tick 0 e o 1.
    expect(comparacao.deltaSeries.x).toEqual([0, 0.05, 0.3]);
    expect(comparacao.deltaSeries.y[1]).toBeCloseTo(1 / TICK - 0.5 / TICK, 12);
    expect(comparacao.deltaSeries.y[2]).toBeCloseTo(2 / TICK - 3 / TICK, 12);
  });

  it('não inventa delta onde a referência não passou', () => {
    // A referência começou mais longe da linha e terminou antes da volta.
    const referencia = [0.002, 0.5, 0.998];
    const alvo = [0.0001, 0.25, 0.5, 0.75, 0.9999];

    const comparacao = compareToReference(referenciaDe(referencia), alvoDe(alvo));

    expect(comparacao.deltaSeries.x).toEqual([0.25, 0.5, 0.75]);
  });

  it('aceita a posição levemente negativa logo depois da linha', () => {
    // Medido em Suzuka: -0,0000129 numa volta válida. É o dado como ele é.
    const posicoes = [-0.0000129, ...constante(60).slice(1)];

    const comparacao = compareToReference(referenciaDe(posicoes), alvoDe(posicoes));

    expect(comparacao.deltaSeries.x[0]).toBe(-0.0000129);
    expect(comparacao.deltaSeries.y[0]).toBe(0);
  });

  it('carro que recuou: conta quando chegou, não quando voltou a passar', () => {
    // Rodou dentro da pista e recuou até 30% antes de seguir. A volta vale.
    const alvo = [0, 0.2, 0.4, 0.3, 0.35, 0.4, 0.6, 0.8];
    const referencia = [0, 0.2, 0.4, 0.6, 0.8];

    const comparacao = compareToReference(referenciaDe(referencia), alvoDe(alvo));

    expect(comparacao.deltaSeries.x).toEqual([0, 0.2, 0.4, 0.6, 0.8]);
    // Os três ticks do recuo aparecem como tempo perdido de 40% em diante.
    expect(comparacao.deltaSeries.y[2]).toBe(0);
    expect(comparacao.deltaSeries.y[3]).toBeCloseTo(3 / TICK, 12);
  });

  it('recusa carro diferente antes de qualquer conta', () => {
    const alvo = { ...alvoDe(constante(10)), car: aCar({ id: 'mx5', name: 'Mazda MX-5' }) };

    expect(() => compareToReference(referenciaDe(constante(10)), alvo)).toThrow(
      IncompatibleReferenceError,
    );
  });

  it('série que não corresponde às amostras da volta falha alto', () => {
    const alvo = { ...alvoDe(constante(10)), lap: aLap({ startSample: 0, endSample: 99 }) };

    expect(() => compareToReference(referenciaDe(constante(10)), alvo)).toThrow(
      /10 posições para 100 amostras/,
    );
  });

  it('volta sem série gravada falha alto', () => {
    const alvo = { ...alvoDe(constante(10)), series: [] };

    expect(() => compareToReference(referenciaDe(constante(10)), alvo)).toThrow(InvariantError);
  });

  it('volta sem tempo cronometrado falha alto', () => {
    const alvo = alvoDe(constante(10));
    const semTempo = { ...alvo, lap: { ...alvo.lap, lapTimeSeconds: null } };

    expect(() => compareToReference(referenciaDe(constante(10)), semTempo)).toThrow(
      /sem tempo cronometrado/,
    );
  });
});

describe('compareToReference, setor a setor', () => {
  const SETORES = [0, 0.25, 0.5, 0.75];

  it('volta contra ela mesma: diferença zero em todo setor', () => {
    const posicoes = constante(600);

    const { sectors } = compareToReference(referenciaDe(posicoes), alvoDe(posicoes, SETORES));

    expect(sectors?.map((setor) => setor.deltaSeconds)).toEqual([0, 0, 0, 0]);
  });

  it('a perda aparece só no setor em que andou mais devagar', () => {
    // Igual à referência até 0,5; dali a 0,75, metade da velocidade; depois,
    // igual de novo. Referência: 120 ticks, 30 por setor.
    const alvo = [
      ...Array.from({ length: 60 }, (_, k) => k / 120),
      ...Array.from({ length: 60 }, (_, k) => 0.5 + k / 240),
      ...Array.from({ length: 30 }, (_, k) => 0.75 + k / 120),
    ];

    const { sectors, totalDeltaSeconds } = compareToReference(
      referenciaDe(constante(120)),
      alvoDe(alvo, SETORES),
    );

    const deltas = sectors?.map((setor) => setor.deltaSeconds) ?? [];
    expect(deltas[0]).toBeCloseTo(0, 9);
    expect(deltas[1]).toBeCloseTo(0, 9);
    expect(deltas[2]).toBeCloseTo(30 / TICK, 9);
    expect(deltas[3]).toBeCloseTo(0, 9);
    // A soma dos setores fecha o delta da volta: nada sobra, nada falta.
    expect(deltas.reduce((soma, d) => (soma ?? 0) + (d ?? 0), 0)).toBeCloseTo(totalDeltaSeconds, 9);
  });

  it('cada setor diz onde começa, onde termina e o tempo das duas voltas', () => {
    const posicoes = constante(120);

    const { sectors } = compareToReference(referenciaDe(posicoes), alvoDe(posicoes, SETORES));

    expect(sectors?.[3]).toEqual({
      index: 3,
      startPct: 0.75,
      endPct: 1,
      lapSeconds: 30 / TICK,
      referenceSeconds: 30 / TICK,
      deltaSeconds: 0,
    });
  });

  it('sessão sem setores declarados: sem setores, e o delta continua igual', () => {
    const comparacao = compareToReference(referenciaDe(constante(60)), alvoDe(constante(60)));

    expect(comparacao.sectors).toBeNull();
    expect(comparacao.deltaSeries.y.every((delta) => delta === 0)).toBe(true);
  });
});
