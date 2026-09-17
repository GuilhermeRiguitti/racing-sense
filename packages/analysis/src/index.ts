/**
 * Camada de análise: onde o produto realmente mora.
 *
 * O parser é commodity — existem quatro implementações públicas do formato.
 * O que diferencia é o que vem depois: recortar voltas corretamente, normalizar
 * por distância e comparar contra uma referência sem mentir no delta.
 */
import type { ChannelSeries, Lap, LapComparison, ReferenceLap } from '@telemetry/contracts';

/** Ainda não implementado — ver `docs/roadmap.md`. */
export class NotImplementedError extends Error {
  override readonly name = 'NotImplementedError';
}

/** Amostras de um canal, na ordem em que foram gravadas. */
export interface RawChannel {
  name: string;
  unit: string;
  values: readonly number[];
}

export interface LapDetectionInput {
  tickRate: number;
  /** `Lap` — número da volta reportado pelo sim. */
  lapNumber: readonly number[];
  /** `LapDistPct` — posição na volta, de 0 a 1. */
  lapDistPct: readonly number[];
  /** `LapCurrentLapTime`, quando disponível. Melhora o tempo de volta. */
  lapCurrentLapTime?: readonly number[];
  /** `OnPitRoad` — marca out lap e in lap. */
  onPitRoad?: readonly boolean[];
}

/**
 * Recorta as amostras em voltas.
 *
 * TODO(mvp): implementar. Armadilhas conhecidas, nesta ordem de importância:
 *  - `LapDistPct` volta a zero na linha, mas também oscila perto dela: usar só
 *    a transição não basta, precisa de histerese;
 *  - a gravação começa e termina no meio de uma volta — a primeira e a última
 *    quase nunca são voltas completas;
 *  - reset para os boxes e teleporte produzem saltos de distância que não são volta;
 *  - out lap e in lap são voltas válidas para o sim e inúteis para comparação.
 */
export function detectLaps(_input: LapDetectionInput): Lap[] {
  throw new NotImplementedError('detectLaps ainda não foi implementado');
}

/**
 * Reamostra um canal do eixo tempo para o eixo distância (`lapDistPct`).
 *
 * Comparar duas voltas no eixo do tempo não funciona: quem freia mais tarde
 * desalinha tudo dali para a frente. Toda comparação acontece por distância.
 */
export function toDistanceSeries(
  _channel: RawChannel,
  _lapDistPct: readonly number[],
  _resolution: number,
): ChannelSeries {
  throw new NotImplementedError('toDistanceSeries ainda não foi implementado');
}

/**
 * Reduz a quantidade de pontos preservando a forma da curva.
 *
 * 60 Hz numa stint de 30 min dá ~108 mil pontos por canal; um gráfico de 1200 px
 * não usa nem 1% disso. Reduzir por média simples achata picos de frenagem,
 * que é exatamente o que o piloto quer ver — por isso o alvo é um algoritmo que
 * preserve extremos (LTTB ou min/max por bucket). Ver docs/adr/0007.
 */
export function downsample(_series: ChannelSeries, _targetPoints: number): ChannelSeries {
  throw new NotImplementedError('downsample ainda não foi implementado');
}

/**
 * Compara uma volta contra a referência importada e devolve o delta por distância.
 *
 * TODO(mvp): implementar. O delta acumulado sai da diferença de tempo para
 * percorrer cada fatia de distância; os segmentos saem de onde a derivada do
 * delta muda de sinal de forma sustentada.
 */
export function compareToReference(
  _reference: ReferenceLap,
  _target: { lap: Lap; series: readonly ChannelSeries[] },
): LapComparison {
  throw new NotImplementedError('compareToReference ainda não foi implementado');
}
