import { type Arrivals, arrivalAt, firstArrivals } from './arrivals.js';
import { type ChannelSeries, createChannelSeries } from './channel.js';
import { InvariantError } from './errors.js';
import type { Lap } from './lap.js';
import type { ReferenceLap } from './reference-lap.js';
import { assertComparable } from './reference-lap.js';
import { type SectorStarts, sectorTimes } from './sectors.js';
import type { CarRef, TrackRef } from './session.js';

export interface LapComparison {
  readonly referenceLapId: ReferenceLap['id'];
  readonly lapNumber: number;
  /**
   * Tempo da volta menos o da referência. Negativo = a volta foi mais rápida.
   *
   * Sai dos dois tempos de volta medidos, não do último ponto de `deltaSeries`:
   * a série termina na última amostra antes da linha, até um tick antes dela.
   */
  readonly totalDeltaSeconds: number;
  /**
   * Delta acumulado ao longo da volta, eixo `lapDistPct`, em segundos.
   *
   * Um ponto por amostra da volta analisada, na posição medida dela — sem
   * grade. Negativo = naquele ponto a volta estava à frente da referência.
   */
  readonly deltaSeries: ChannelSeries;
  /**
   * Onde o tempo foi ganho ou perdido, setor a setor da pista.
   *
   * É a segmentação do delta: o corte vem dos setores que o sim declara, não de
   * um limiar sobre a derivada (regra 18). `null` quando a sessão não tem
   * setores — arquivo sem o bloco, ou sessão gravada antes de o app lê-lo.
   */
  readonly sectors: readonly SectorComparison[] | null;
}

/** Um setor da pista, com o tempo das duas voltas nele. */
export interface SectorComparison {
  /** Posição do setor na volta, a partir de 0 — a numeração do sim. */
  readonly index: number;
  readonly startPct: number;
  /** Onde o setor termina: o começo do seguinte, ou a linha (1) no último. */
  readonly endPct: number;
  readonly lapSeconds: number | null;
  readonly referenceSeconds: number | null;
  /**
   * Tempo da volta menos o da referência, só neste setor. Negativo = ganhou
   * tempo aqui. `null` quando uma das duas voltas não amostrou a divisa.
   */
  readonly deltaSeconds: number | null;
}

export interface ComparisonTarget {
  readonly track: TrackRef;
  readonly car: CarRef;
  readonly lap: Lap;
  readonly series: readonly ChannelSeries[];
  /**
   * Os setores da pista, da sessão da volta analisada. A pista é a mesma da
   * referência — `assertComparable` recusa antes, se não for.
   */
  readonly sectorStartPcts: SectorStarts | null;
}

/** Nome da série de delta. Não é canal do sim — é conta do domínio. */
export const DELTA_CHANNEL = 'Delta';

/**
 * Compara uma volta contra a referência.
 *
 * A checagem de compatibilidade roda **antes** de qualquer conta: comparar
 * carros ou pistas diferentes produz número plausível e sem sentido.
 *
 * O delta em cada ponto da pista é **quando a volta chegou ali menos quando a
 * referência chegou ali** (`firstArrivals`). O tempo da referência numa posição
 * que ela não amostrou é interpolado entre os dois ticks vizinhos
 * (`arrivalAt`).
 *
 * Não existe grade de reamostragem, e portanto nenhuma resolução escolhida: o
 * delta é avaliado nas posições que a volta analisada de fato amostrou.
 *
 * Posição que a referência não cobriu (a volta analisada passou um pouco antes
 * da primeira amostra dela, ou depois da última) fica sem ponto. Extrapolar
 * produziria delta plausível e inventado.
 */
export function compareToReference(
  reference: ReferenceLap,
  target: ComparisonTarget,
): LapComparison {
  assertComparable(reference, target);

  const alvo = arrivalsOf(target.lap, target.series);
  const regua = arrivalsOf(reference.lap, reference.series);

  const x: number[] = [];
  const y: number[] = [];
  // As duas passagens crescem em distância: a busca continua de onde parou.
  let hint = 0;
  for (let i = 0; i < alvo.x.length; i += 1) {
    const posicao = alvo.x[i] ?? 0;
    const daReferencia = arrivalAt(regua, posicao, hint);
    if (daReferencia === null) continue; // fora do que a referência cobriu
    hint = daReferencia.index;

    x.push(posicao);
    y.push((alvo.t[i] ?? 0) - daReferencia.seconds);
  }

  return {
    referenceLapId: reference.id,
    lapNumber: target.lap.number,
    totalDeltaSeconds: alvo.lapTimeSeconds - regua.lapTimeSeconds,
    deltaSeries: createChannelSeries({
      channel: DELTA_CHANNEL,
      unit: 's',
      type: 'number',
      axis: 'lapDistPct',
      x,
      y,
    }),
    sectors:
      target.sectorStartPcts === null ? null : compareSectors(alvo, regua, target.sectorStartPcts),
  };
}

function compareSectors(
  alvo: Arrivals,
  regua: Arrivals,
  starts: SectorStarts,
): SectorComparison[] {
  const daVolta = sectorTimes(alvo, starts);
  const daReferencia = sectorTimes(regua, starts);
  return starts.map((startPct, index) => {
    const lapSeconds = daVolta[index] ?? null;
    const referenceSeconds = daReferencia[index] ?? null;
    return {
      index,
      startPct,
      endPct: starts[index + 1] ?? 1,
      lapSeconds,
      referenceSeconds,
      deltaSeconds:
        lapSeconds === null || referenceSeconds === null ? null : lapSeconds - referenceSeconds,
    };
  });
}

/**
 * Todo canal gravado da volta carrega a posição medida de cada amostra; basta
 * um. Sem nenhum, não há como saber onde o carro estava em cada tick.
 */
function arrivalsOf(lap: Lap, series: readonly ChannelSeries[]): Arrivals {
  const posicoes = series[0]?.x;
  if (posicoes === undefined) {
    throw new InvariantError(`Volta ${lap.number} sem série gravada: não há posição por amostra`);
  }
  return firstArrivals(lap, posicoes);
}
