import type { ChannelSeries, ChannelType } from './channel.js';

/**
 * Um canal resumido ao longo de uma volta.
 *
 * É o que o engenheiro olha entre uma volta e outra: com quanto combustível
 * começou e terminou, a pressão média do pneu, a temperatura máxima da água.
 * Toda conta é sobre as amostras gravadas, sem nenhum número escolhido:
 *
 * - **Média por amostra é média no tempo.** Cada amostra é um tick, e os ticks
 *   são igualmente espaçados — então a média simples já pondera pelo tempo que
 *   o carro passou em cada valor. Não é média por distância, e não precisa ser:
 *   o pneu esquenta com o tempo, não com o metro.
 * - **Canal booleano tem média**: é a fração do tempo em que ele esteve ligado
 *   (quanto da volta o ABS trabalhou).
 * - **Bitfield e texto não têm**: a média de uma máscara de bits não é valor
 *   que o canal possa ter.
 */
export interface ChannelSummary {
  readonly channel: string;
  readonly unit: string;
  readonly type: ChannelType;
  readonly first: number;
  readonly last: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number | null;
}

/** Resume uma série. Série vazia não tem resumo: devolve `null`, não zeros. */
export function summarizeSeries(series: ChannelSeries): ChannelSummary | null {
  const { y } = series;
  if (y.length === 0) return null;

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let soma = 0;
  for (const valor of y) {
    if (valor < min) min = valor;
    if (valor > max) max = valor;
    soma += valor;
  }
  const temMedia = series.type !== 'bitfield' && series.type !== 'text';

  return {
    channel: series.channel,
    unit: series.unit,
    type: series.type,
    first: y[0] ?? 0,
    last: y[y.length - 1] ?? 0,
    min,
    max,
    mean: temMedia ? soma / y.length : null,
  };
}

/** Resume todas as séries de uma volta, pulando as vazias. */
export function summarizeLap(series: readonly ChannelSeries[]): ChannelSummary[] {
  return series
    .map(summarizeSeries)
    .filter((resumo): resumo is ChannelSummary => resumo !== null);
}
