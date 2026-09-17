import { NotImplementedError } from '../shared/errors.js';
import type { ChannelSeries } from '../telemetry/channel.js';

/**
 * Reamostra uma série do eixo tempo para o eixo distância.
 *
 * Comparar duas voltas no eixo do tempo não funciona: quem freia mais tarde
 * desalinha tudo dali para frente. Toda comparação acontece por distância.
 *
 * TODO(etapa 2): implementar.
 */
export function toDistanceSeries(
  _series: ChannelSeries,
  _lapDistPct: readonly number[],
  _resolution: number,
): ChannelSeries {
  throw new NotImplementedError('toDistanceSeries: reamostragem por distância não implementada');
}

/**
 * Reduz a quantidade de pontos preservando a forma da curva.
 *
 * Média simples achata pico de frenagem, que é justamente o que o piloto quer
 * ver — o alvo é LTTB ou min/max por bucket. Reduz-se para desenhar, nunca para
 * calcular delta.
 *
 * TODO(etapa 2): implementar.
 */
export function downsample(_series: ChannelSeries, _targetPoints: number): ChannelSeries {
  throw new NotImplementedError('downsample: redução de pontos não implementada');
}
