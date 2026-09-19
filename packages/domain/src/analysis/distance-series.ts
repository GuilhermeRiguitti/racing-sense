import { InvariantError } from '../shared/errors.js';
import { type ChannelSeries, createChannelSeries } from '../telemetry/channel.js';

/**
 * Reamostra uma série do eixo tempo para o eixo distância.
 *
 * Comparar duas voltas no eixo do tempo não funciona: quem freia mais tarde
 * desalinha tudo dali para frente. Toda comparação acontece por distância.
 *
 * `lapDistPct` traz a posição de cada amostra da série — os dois arrays andam
 * juntos, uma posição por amostra. A saída fica numa grade uniforme de
 * `resolution` pontos entre 0 e 1, que é o que torna duas voltas somáveis ponto
 * a ponto.
 *
 * **Só emite grade coberta pelos dados.** Uma volta cortada pela gravação vai de
 * 0 a 55% da pista; inventar os 45% restantes por extrapolação produziria
 * gráfico plausível e falso. O `x` da saída diz até onde a volta foi.
 */
export function toDistanceSeries(
  series: ChannelSeries,
  lapDistPct: readonly number[],
  resolution: number,
): ChannelSeries {
  if (series.y.length !== lapDistPct.length) {
    throw new InvariantError(
      `Série "${series.channel}": ${series.y.length} valores para ${lapDistPct.length} posições`,
    );
  }
  if (resolution < 2) {
    throw new InvariantError(`Resolução inválida: ${resolution} (mínimo 2 pontos)`);
  }
  if (lapDistPct.length === 0) {
    return createChannelSeries({ ...series, axis: 'lapDistPct', x: [], y: [] });
  }

  const x: number[] = [];
  const y: number[] = [];
  // Ponteiro que só avança: a distância cresce ao longo da volta, então varrer
  // do começo a cada ponto da grade seria quadrático sem ganho nenhum.
  let amostra = 0;

  for (let i = 0; i < resolution; i += 1) {
    const alvo = i / (resolution - 1);
    while (amostra + 1 < lapDistPct.length && (lapDistPct[amostra + 1] ?? 0) < alvo) {
      amostra += 1;
    }
    const antes = lapDistPct[amostra] ?? 0;
    const depois = lapDistPct[amostra + 1];
    if (depois === undefined || alvo < antes) continue; // fora do trecho gravado

    const vao = depois - antes;
    const peso = vao > 0 ? (alvo - antes) / vao : 0;
    const a = series.y[amostra] ?? 0;
    const b = series.y[amostra + 1] ?? a;
    x.push(alvo);
    y.push(a + (b - a) * peso);
  }

  return createChannelSeries({
    channel: series.channel,
    unit: series.unit,
    axis: 'lapDistPct',
    x,
    y,
  });
}

/**
 * Reduz a quantidade de pontos preservando a forma da curva.
 *
 * Média simples achata pico de frenagem, que é justamente o que o piloto quer
 * ver: numa volta de 6 mil amostras reduzida para 400, a média transformaria
 * uma frenagem de 95% de pressão em algo perto de 40% e ninguém notaria.
 *
 * A estratégia é min/max por balde: cada balde entrega seus dois extremos, na
 * ordem em que aconteceram. O pico sobrevive por construção, e não por
 * heurística de "importância" como no LTTB.
 *
 * **Reduz-se para desenhar, nunca para calcular delta** (ADR 0007).
 */
export function downsample(series: ChannelSeries, targetPoints: number): ChannelSeries {
  if (targetPoints < 2) {
    throw new InvariantError(`Alvo inválido: ${targetPoints} pontos (mínimo 2)`);
  }
  const total = series.x.length;
  if (total <= targetPoints) return series;

  // Dois pontos por balde, e as pontas entram sempre: começo e fim de volta são
  // referência visual, some com eles e o gráfico parece cortado.
  const baldes = Math.max(1, Math.floor(targetPoints / 2));
  const escolhidos = new Set<number>([0, total - 1]);

  for (let balde = 0; balde < baldes; balde += 1) {
    const inicio = Math.floor((balde * total) / baldes);
    const fim = Math.min(total, Math.floor(((balde + 1) * total) / baldes));
    if (inicio >= fim) continue;

    let menor = inicio;
    let maior = inicio;
    for (let i = inicio; i < fim; i += 1) {
      if ((series.y[i] ?? 0) < (series.y[menor] ?? 0)) menor = i;
      if ((series.y[i] ?? 0) > (series.y[maior] ?? 0)) maior = i;
    }
    escolhidos.add(menor);
    escolhidos.add(maior);
  }

  const indices = [...escolhidos].sort((a, b) => a - b);
  return createChannelSeries({
    channel: series.channel,
    unit: series.unit,
    axis: series.axis,
    x: indices.map((i) => series.x[i] ?? 0),
    y: indices.map((i) => series.y[i] ?? 0),
  });
}
