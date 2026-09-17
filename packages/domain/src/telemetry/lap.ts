import { InvariantError } from '../shared/errors.js';

/**
 * Uma volta recortada da gravação.
 *
 * As amostras do arquivo não vêm agrupadas por volta — o recorte é feito pela
 * análise. `startSample`/`endSample` são índices de amostra, não instantes:
 * o tempo se deriva com `índice / tickRate`.
 */
export interface Lap {
  /** Número da volta como o sim reporta. */
  readonly number: number;
  readonly startSample: number;
  readonly endSample: number;
  readonly lapTimeSeconds: number | null;
  /** Falso para out lap, in lap e volta cortada pelo início ou fim da gravação. */
  readonly isComplete: boolean;
}

/** Duração da volta derivada dos índices de amostra. */
export function lapDurationSeconds(lap: Lap, tickRate: number): number {
  if (tickRate <= 0) {
    throw new InvariantError(`tickRate inválido: ${tickRate}`);
  }
  if (lap.endSample < lap.startSample) {
    throw new InvariantError(
      `Volta ${lap.number}: endSample (${lap.endSample}) antes de startSample (${lap.startSample})`,
    );
  }
  return (lap.endSample - lap.startSample) / tickRate;
}

/** Voltas que servem para comparação: out lap e in lap não servem. */
export function isComparable(lap: Lap): boolean {
  return lap.isComplete && lap.lapTimeSeconds !== null;
}
