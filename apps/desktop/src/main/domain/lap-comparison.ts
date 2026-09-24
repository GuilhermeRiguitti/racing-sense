import { type ChannelSeries, createChannelSeries } from './channel.js';
import { InvariantError } from './errors.js';
import type { Lap } from './lap.js';
import type { ReferenceLap } from './reference-lap.js';
import { assertComparable } from './reference-lap.js';
import type { CarRef, TrackRef } from './session.js';

/*
 * Por que não existe segmentação de ganho e perda aqui, ainda.
 *
 * A proposta era cortar a volta onde a derivada do delta "muda de sinal de forma
 * sustentada". "Sustentada" é um limiar — quantos metros, quantos centésimos —
 * e o efeito dele depende de onde o piloto freou: exatamente o número arbitrado
 * que a regra 18c proíbe. Devolver lista vazia no lugar seria stub mentindo.
 *
 * O corte sem número escolhido são os setores da pista, que a session info
 * declara (pendência 7). Quando eles viajarem com a volta, a segmentação volta
 * a partir deles.
 */

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
}

export interface ComparisonTarget {
  readonly track: TrackRef;
  readonly car: CarRef;
  readonly lap: Lap;
  readonly series: readonly ChannelSeries[];
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
 * referência chegou ali**. É a definição e mais nada:
 *
 * - O tempo de cada amostra vem da contagem de amostras, não de canal de relógio:
 *   cada amostra é um tick, e a volta dura exatamente `n` ticks (`detectLaps`).
 * - A posição de cada amostra é a medida pelo sim (`lapDistPct`), como gravada.
 * - O tempo da referência numa posição que ela não amostrou é interpolado entre
 *   os dois ticks vizinhos. Interpolar tempo é legítimo — ele é contínuo, e o
 *   carro passou por todas as posições entre um tick e outro.
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

  const alvo = firstArrivals(target.lap, target.series);
  const regua = firstArrivals(reference.lap, reference.series);

  const primeira = regua.x[0] ?? Number.POSITIVE_INFINITY;
  const ultima = regua.x[regua.x.length - 1] ?? Number.NEGATIVE_INFINITY;
  const x: number[] = [];
  const y: number[] = [];
  // Ponteiro que só avança: as duas passagens crescem em distância.
  let j = 0;
  for (let i = 0; i < alvo.x.length; i += 1) {
    const posicao = alvo.x[i] ?? 0;
    if (posicao < primeira || posicao > ultima) continue; // fora do que a referência cobriu

    while (j + 1 < regua.x.length && (regua.x[j + 1] ?? 0) < posicao) j += 1;
    const antes = regua.x[j] ?? 0;
    const depois = regua.x[j + 1] ?? antes;
    const tAntes = regua.t[j] ?? 0;
    const tDepois = regua.t[j + 1] ?? tAntes;
    const vao = depois - antes;
    const peso = vao > 0 ? (posicao - antes) / vao : 0;
    const tempoDaReferencia = tAntes + (tDepois - tAntes) * peso;

    x.push(posicao);
    y.push((alvo.t[i] ?? 0) - tempoDaReferencia);
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
  };
}

interface FirstArrivals {
  readonly lapTimeSeconds: number;
  /** Posições estritamente crescentes. */
  readonly x: readonly number[];
  /** Segundos desde a linha de chegada, um por posição. */
  readonly t: readonly number[];
}

/**
 * Quando a volta chegou pela primeira vez a cada posição que amostrou.
 *
 * Numa volta normal é a própria volta, amostra a amostra. O "primeira vez"
 * existe para o carro que andou para trás — rodou dentro da pista e voltou
 * alguns metros, sem sair dela, e a volta continua válida (ADR 0018). A posição
 * repetida não ganha um segundo tempo: o delta mede quando se chegou, e a
 * amostra que não passa da maior posição já alcançada não chegou a lugar novo.
 * Nenhum número entra nessa decisão.
 */
function firstArrivals(lap: Lap, series: readonly ChannelSeries[]): FirstArrivals {
  if (lap.lapTimeSeconds === null) {
    throw new InvariantError(`Volta ${lap.number} sem tempo cronometrado não tem delta`);
  }
  const amostras = lap.endSample - lap.startSample + 1;
  // Todo canal gravado da volta carrega a posição medida de cada amostra; basta
  // um. Sem nenhum, não há como saber onde o carro estava em cada tick.
  const posicoes = series[0]?.x;
  if (posicoes === undefined) {
    throw new InvariantError(`Volta ${lap.number} sem série gravada: não há posição por amostra`);
  }
  if (posicoes.length !== amostras) {
    throw new InvariantError(
      `Volta ${lap.number}: ${posicoes.length} posições para ${amostras} amostras`,
    );
  }

  const porAmostra = lap.lapTimeSeconds / amostras;
  const x: number[] = [];
  const t: number[] = [];
  let maior = Number.NEGATIVE_INFINITY;
  for (let k = 0; k < posicoes.length; k += 1) {
    const posicao = posicoes[k] ?? 0;
    if (posicao <= maior) continue;
    maior = posicao;
    x.push(posicao);
    t.push(k * porAmostra);
  }
  return { lapTimeSeconds: lap.lapTimeSeconds, x, t };
}
