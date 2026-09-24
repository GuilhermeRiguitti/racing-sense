import { InvariantError } from './errors.js';
import type { Lap } from './lap.js';

/**
 * Quando a volta chegou a cada ponto da pista que amostrou.
 *
 * É a base de toda conta de tempo por distância — o delta contra a referência
 * e o tempo de cada setor saem daqui, e por isso a regra mora num lugar só.
 */
export interface Arrivals {
  readonly lapTimeSeconds: number;
  /** Posições estritamente crescentes, em `lapDistPct`. */
  readonly x: readonly number[];
  /** Segundos desde a linha de chegada, um por posição. */
  readonly t: readonly number[];
}

/**
 * Quando a volta chegou pela primeira vez a cada posição que amostrou.
 *
 * - O tempo de cada amostra vem da contagem de amostras, não de canal de
 *   relógio: cada amostra é um tick, e a volta dura exatamente `n` ticks
 *   (`detectLaps`).
 * - A posição de cada amostra é a medida pelo sim (`lapDistPct`), como gravada.
 *
 * Numa volta normal é a própria volta, amostra a amostra. O "primeira vez"
 * existe para o carro que andou para trás — rodou dentro da pista e voltou
 * alguns metros, sem sair dela, e a volta continua válida (ADR 0018). A posição
 * repetida não ganha um segundo tempo: a conta mede quando se chegou, e a
 * amostra que não passa da maior posição já alcançada não chegou a lugar novo.
 * Nenhum número entra nessa decisão.
 */
export function firstArrivals(lap: Lap, positions: readonly number[]): Arrivals {
  if (lap.lapTimeSeconds === null) {
    throw new InvariantError(`Volta ${lap.number} sem tempo cronometrado não tem tempo por distância`);
  }
  const amostras = lap.endSample - lap.startSample + 1;
  if (positions.length !== amostras) {
    throw new InvariantError(
      `Volta ${lap.number}: ${positions.length} posições para ${amostras} amostras`,
    );
  }

  const porAmostra = lap.lapTimeSeconds / amostras;
  const x: number[] = [];
  const t: number[] = [];
  let maior = Number.NEGATIVE_INFINITY;
  for (let k = 0; k < positions.length; k += 1) {
    const posicao = positions[k] ?? 0;
    if (posicao <= maior) continue;
    maior = posicao;
    x.push(posicao);
    t.push(k * porAmostra);
  }
  return { lapTimeSeconds: lap.lapTimeSeconds, x, t };
}

/**
 * Quando a volta passou por `position`, entre as duas amostras vizinhas.
 *
 * Interpolar tempo é legítimo — ele é contínuo, e o carro passou por todas as
 * posições entre um tick e outro. Posição fora do que a volta amostrou devolve
 * `null`: extrapolar produziria um tempo plausível e inventado.
 *
 * `hint` é o índice de onde começar a procurar, para quem percorre posições em
 * ordem crescente não refazer a busca do zero a cada chamada.
 */
export function arrivalAt(arrivals: Arrivals, position: number, hint = 0): ArrivalAt | null {
  const { x, t } = arrivals;
  const primeira = x[0];
  const ultima = x[x.length - 1];
  if (primeira === undefined || ultima === undefined) return null;
  if (position < primeira || position > ultima) return null;

  let j = Math.max(0, Math.min(hint, x.length - 1));
  while (j > 0 && (x[j] ?? 0) > position) j -= 1;
  while (j + 1 < x.length && (x[j + 1] ?? 0) < position) j += 1;

  const antes = x[j] ?? 0;
  const depois = x[j + 1] ?? antes;
  const tAntes = t[j] ?? 0;
  const tDepois = t[j + 1] ?? tAntes;
  const vao = depois - antes;
  const peso = vao > 0 ? (position - antes) / vao : 0;
  return { seconds: tAntes + (tDepois - tAntes) * peso, index: j };
}

export interface ArrivalAt {
  readonly seconds: number;
  /** Índice da amostra imediatamente antes: serve de `hint` para a próxima busca. */
  readonly index: number;
}
