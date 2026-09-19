import { InvariantError } from '../shared/errors.js';

/**
 * Por que uma volta não serve como referência de comparação.
 *
 * Ela continua existindo, aparecendo na lista e sendo analisável — a marcação
 * decide só uma coisa: se a volta pode virar a régua contra a qual as outras
 * são medidas. Eleger como referência uma volta em que o piloto cortou a pista
 * torna toda comparação seguinte mentirosa.
 */
export type LapFlag =
  /** Cortada pelo início ou pelo fim da gravação. */
  | 'incomplete'
  /** Passou pelo pit lane: out lap ou in lap. Tempo não representa ritmo. */
  | 'pit'
  /** Saiu da pista em algum ponto. É o que o sim usa para invalidar volta. */
  | 'off-track'
  /** O sim contou incidente durante a volta. */
  | 'incident'
  /** Reset para os boxes ou teleporte: a distância andou para trás. */
  | 'teleport';

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
  /** Vazio quando a volta pode ser referência. Ver `LapFlag`. */
  readonly flags: readonly LapFlag[];
}

/**
 * Duração da volta derivada dos índices de amostra.
 *
 * O `+ 1` não é detalhe: a volta ocupa da amostra inicial à final **inclusive**,
 * e a linha de chegada é cruzada no intervalo seguinte à última amostra. Medido
 * contra um arquivo real, esta conta erra 1 ms no tempo que o sim publicou;
 * esquecer o `+ 1` erra um tick inteiro (16 ms a 60 Hz) para menos, sempre.
 */
export function lapDurationSeconds(lap: Lap, tickRate: number): number {
  if (tickRate <= 0) {
    throw new InvariantError(`tickRate inválido: ${tickRate}`);
  }
  if (lap.endSample < lap.startSample) {
    throw new InvariantError(
      `Volta ${lap.number}: endSample (${lap.endSample}) antes de startSample (${lap.startSample})`,
    );
  }
  return (lap.endSample - lap.startSample + 1) / tickRate;
}

/**
 * Voltas que servem de referência para comparação.
 *
 * Note que isto **não** é "voltas que valem a pena analisar". Uma volta com
 * saída de pista tem conteúdo útil — é onde o piloto perdeu tempo, e é isso que
 * o coach existe para contar. Ela só não pode ser a régua.
 */
export function isComparable(lap: Lap): boolean {
  return lap.flags.length === 0 && lap.lapTimeSeconds !== null;
}
