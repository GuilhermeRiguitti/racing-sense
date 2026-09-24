import { describe, expect, it } from 'vitest';
import { detectLaps, type LapSignals } from './lap-detection.js';

/**
 * Monta sinais sintéticos: `voltas` diz quantas amostras cada volta tem, e a
 * distância vai de 0 a 1 dentro de cada uma.
 */
function pista(voltas: readonly number[], primeiroNumero = 1): LapSignals {
  const lapNumber: number[] = [];
  const lapDistPct: number[] = [];
  voltas.forEach((amostras, indice) => {
    for (let i = 0; i < amostras; i += 1) {
      lapNumber.push(primeiroNumero + indice);
      lapDistPct.push(i / amostras);
    }
  });
  return { tickRate: 60, lapNumber, lapDistPct };
}

describe('detectLaps', () => {
  it('não inventa volta em gravação vazia', () => {
    expect(detectLaps({ tickRate: 60, lapNumber: [], lapDistPct: [] })).toEqual([]);
  });

  it('recorta na linha de chegada e deriva o tempo dos índices', () => {
    const voltas = detectLaps(pista([60, 120, 60]));

    expect(voltas.map((v) => v.number)).toEqual([1, 2, 3]);
    expect(voltas[1]?.isComplete).toBe(true);
    expect(voltas[1]?.lapTimeSeconds).toBe(2);
  });

  it('marca como incompletas a primeira e a última, que a gravação cortou', () => {
    const voltas = detectLaps(pista([60, 120, 60]));

    expect(voltas[0]?.isComplete).toBe(false);
    expect(voltas[0]?.lapTimeSeconds).toBeNull();
    expect(voltas[0]?.flags).toContain('incomplete');
    expect(voltas[2]?.flags).toContain('incomplete');
  });

  it('gravação sem nenhum cruzamento vira uma volta incompleta, não zero voltas', () => {
    const voltas = detectLaps(pista([90]));

    expect(voltas).toHaveLength(1);
    expect(voltas[0]?.isComplete).toBe(false);
  });

  it('número que muda longe da linha não produz volta completa', () => {
    // A primeira amostra do arquivo sai zerada e o número pula para o da volta
    // em curso. Sem o sinal de "fora do mundo" para cortá-la, ela vira um
    // trecho de uma amostra — incompleto, nunca contado como volta.
    const base = pista([120, 120], 6);
    const lapNumber = [0, ...base.lapNumber.slice(1)];
    const lapDistPct = [0, ...base.lapDistPct.slice(1)];

    const voltas = detectLaps({ ...base, lapNumber, lapDistPct });

    expect(voltas.filter((v) => v.isComplete)).toEqual([]);
    expect(voltas.map((v) => v.number)).toEqual([0, 6, 7]);
  });

  it('contador que reinicia no meio do arquivo não cola duas voltas', () => {
    // O bug real, visto em arquivos do piloto: o sim volta a contar do 1
    // (sessão nova, reset). A versão anterior juntava o fim da volta 3 com o
    // começo da nova volta 1 e marcava como completa, com o dobro do tempo.
    const trechos = [
      [1, 60],
      [2, 60],
      [3, 60],
      [1, 60],
      [2, 60],
      [3, 60],
    ] as const;
    const lapNumber: number[] = [];
    const lapDistPct: number[] = [];
    for (const [numero, amostras] of trechos) {
      for (let i = 0; i < amostras; i += 1) {
        lapNumber.push(numero);
        lapDistPct.push(i / amostras);
      }
    }

    const voltas = detectLaps({ tickRate: 60, lapNumber, lapDistPct });

    expect(voltas.map((v) => `${v.number}:${v.isComplete ? 'c' : 'i'}`)).toEqual([
      '1:i',
      '2:c',
      '3:i',
      '1:i',
      '2:c',
      '3:i',
    ]);
    // Nenhuma volta com o dobro da duração: toda completa tem um segundo.
    for (const volta of voltas.filter((v) => v.isComplete)) {
      expect(volta.lapTimeSeconds).toBe(1);
    }
  });

  it('não corta quando a distância cruza a linha mas o número não sobe', () => {
    // Manobra na box: o carro vai e volta por cima da linha sem completar volta.
    const lapNumber = [3, 3, 3, 3];
    const lapDistPct = [0.95, 0.99, 0.02, 0.98];

    expect(detectLaps({ tickRate: 60, lapNumber, lapDistPct })).toHaveLength(1);
  });

  it('marca a volta que passou pelo pit lane', () => {
    const base = pista([60, 120, 60]);
    const onPitRoad = base.lapNumber.map((_, i) => i >= 60 && i < 90);

    const voltas = detectLaps({ ...base, onPitRoad });

    expect(voltas[1]?.flags).toContain('pit');
    expect(voltas[1]?.isComplete).toBe(true);
  });

  it('marca saída de pista sem tirar a volta da lista', () => {
    const base = pista([60, 120, 60]);
    const offTrack = base.lapNumber.map((_, i) => i === 100);

    const voltas = detectLaps({ ...base, offTrack });

    expect(voltas[1]?.flags).toEqual(['off-track']);
    expect(voltas[1]?.lapTimeSeconds).toBe(2);
  });

  it('amostra fora do mundo nas pontas não entra em volta nenhuma', () => {
    // A amostra fantasma real: posição 0, número 0, carro fora do mundo.
    const base = pista([120, 120], 6);
    const lapNumber = [0, ...base.lapNumber.slice(1)];
    const lapDistPct = [0, ...base.lapDistPct.slice(1)];
    const inWorld = lapNumber.map((_, i) => i !== 0);

    const voltas = detectLaps({ ...base, lapNumber, lapDistPct, inWorld });

    expect(voltas[0]?.startSample).toBe(1);
  });

  it('gravação inteira fora do mundo não tem volta', () => {
    const base = pista([60]);

    expect(detectLaps({ ...base, inWorld: base.lapNumber.map(() => false) })).toEqual([]);
  });

  it('volta limpa não tem marcação nenhuma', () => {
    const base = pista([60, 120, 60]);
    const voltas = detectLaps({
      ...base,
      onPitRoad: base.lapNumber.map(() => false),
      offTrack: base.lapNumber.map(() => false),
    });

    expect(voltas[1]?.flags).toEqual([]);
  });
});
