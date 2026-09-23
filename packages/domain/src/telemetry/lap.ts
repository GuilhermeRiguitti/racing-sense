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
  | 'off-track';

/**
 * A definição de volta válida é do piloto, e é esta: **completa, sem box e sem
 * corte de pista** (2026-09-22). Cada marcação acima é um desses três fatos, e
 * nada além deles.
 *
 * Por isso não há marcação de incidente. Incidente por saída de pista já é
 * `off-track`; os outros — rodar dentro da pista, bater sem sair dela — não são
 * corte de pista, e a volta vale. O contador de incidentes continua no `.ibt` e
 * pode virar informação para o coach um dia; critério de validade, não.
 */

/**
 * Por que não existe marcação de "carro parado" nem nada derivado de tempo.
 *
 * Decisão do piloto, 2026-09-22: **tempo de volta não invalida volta**. Se ela
 * foi completa e sem corte de pista, vale — tenha durado 1min45 ou dez minutos
 * porque o carro ficou parado no meio.
 *
 * O motivo de estar escrito aqui, e não só no histórico: toda tentativa de
 * detectar carro parado precisa de um limiar (X metros em Y segundos), e limiar
 * é calibrado contra um carro. O que é "devagar demais" num GT3 é ritmo normal
 * num carro de entrada, e o sistema não é só de GT3. É a mesma razão pela qual o
 * ADR 0018 recusou limiar de duração para saída de pista.
 *
 * Antes de acrescentar marcação nova aqui, confira se ela responde a um fato
 * binário do arquivo (passou pela box: sim ou não) ou a um número arbitrado.
 * Fato entra; número arbitrado não.
 *
 * Pelo mesmo critério saiu a marcação de teleporte, que disparava quando a
 * distância recuava mais de 20% da pista. Os 20% eram escolha minha. O caso que
 * ela cobria — reset e reboque — deposita o carro no box, e aí `pit` já marca
 * a volta a partir de um fato do sim. Se um arquivo real um dia mostrar reset
 * que não passa pelo box, a marcação volta, a partir de um fato conferido
 * naquele arquivo.
 */

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
 * Volta válida: a única que serve de material de análise (ADR 0018).
 *
 * Qualquer marcação invalida — saída de pista inclusive, sem limiar de duração.
 * Volta suja mede outra coisa: a excursão muda velocidade de entrada, carga de
 * pneu e linha do resto do setor, e o delta passa a somar erro com estilo sem
 * dizer qual é qual.
 *
 * A volta inválida continua gravada e listada; o que ela não é, é entrada de
 * análise, de comparação ou de referência.
 */
export function isValidLap(lap: Lap): boolean {
  return lap.flags.length === 0 && lap.lapTimeSeconds !== null;
}
