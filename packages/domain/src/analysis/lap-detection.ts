import type { Lap, LapFlag } from '../telemetry/lap.js';

/**
 * Sinais necessários para recortar voltas.
 *
 * Só números e booleanos: a detecção é função pura, não sabe de arquivo nem de
 * canal por nome. Quem traduz canal do sim para estes campos é o caso de uso —
 * é lá que mora o vocabulário do iRacing.
 *
 * Todos os arrays têm o mesmo comprimento: uma posição por amostra.
 */
export interface LapSignals {
  readonly tickRate: number;
  /** Número da volta reportado pelo sim, por amostra. */
  readonly lapNumber: readonly number[];
  /** Posição na volta, de 0 a 1, por amostra. */
  readonly lapDistPct: readonly number[];
  /** Verdadeiro enquanto o carro está no pit lane. Marca out lap e in lap. */
  readonly onPitRoad?: readonly boolean[];
  /** Verdadeiro quando o carro está fora dos limites da pista. */
  readonly offTrack?: readonly boolean[];
  /** Contador acumulado de incidentes do piloto. Só a variação na volta importa. */
  readonly incidentCount?: readonly number[];
}

/**
 * Histerese da linha de chegada.
 *
 * `lapDistPct` oscila perto de zero enquanto o carro manobra na box, e o número
 * da volta também muda em situações que não são cruzamento — a gravação começa
 * no meio da sessão, o sim reseta o carro, a primeira amostra do arquivo sai
 * zerada. Exigir as duas coisas ao mesmo tempo (número subiu **e** a distância
 * saltou do fim para o começo) elimina os três casos sem tratá-los um a um.
 */
const CROSSING_END = 0.9;
const CROSSING_START = 0.1;

/**
 * Recuo de distância que denuncia teleporte.
 *
 * Reset para os boxes joga o carro para trás na pista sem cruzar a linha. Um
 * recuo desse tamanho não acontece dirigindo.
 */
const TELEPORT_DROP = 0.2;

function flagsOf(signals: LapSignals, start: number, end: number, complete: boolean): LapFlag[] {
  const flags: LapFlag[] = [];
  if (!complete) flags.push('incomplete');

  const { onPitRoad, offTrack, incidentCount, lapDistPct } = signals;
  if (onPitRoad !== undefined) {
    for (let i = start; i <= end; i += 1) {
      if (onPitRoad[i] === true) {
        flags.push('pit');
        break;
      }
    }
  }
  if (offTrack !== undefined) {
    for (let i = start; i <= end; i += 1) {
      if (offTrack[i] === true) {
        flags.push('off-track');
        break;
      }
    }
  }
  if (incidentCount !== undefined && (incidentCount[end] ?? 0) > (incidentCount[start] ?? 0)) {
    flags.push('incident');
  }
  for (let i = start + 1; i <= end; i += 1) {
    if ((lapDistPct[i] ?? 0) < (lapDistPct[i - 1] ?? 0) - TELEPORT_DROP) {
      flags.push('teleport');
      break;
    }
  }
  return flags;
}

/**
 * Recorta as amostras em voltas.
 *
 * A linha de chegada é reconhecida pela coincidência de dois sinais, nunca por
 * um só — ver `CROSSING_END`/`CROSSING_START`.
 *
 * A primeira e a última volta do recorte são sempre incompletas: a gravação
 * começa e termina no meio de uma volta. Elas continuam na lista, com tempo
 * nulo, porque sumir com elas esconderia do piloto metade do que ele rodou.
 *
 * O tempo é o intervalo de um cruzamento ao seguinte — conferido contra o tempo
 * que o sim publicou numa volta real, com 1 ms de diferença.
 */
export function detectLaps(signals: LapSignals): Lap[] {
  const { lapNumber, lapDistPct, tickRate } = signals;
  const total = lapNumber.length;
  if (total === 0) return [];

  const starts: number[] = [0];
  for (let i = 1; i < total; i += 1) {
    const cruzou =
      (lapNumber[i] ?? 0) > (lapNumber[i - 1] ?? 0) &&
      (lapDistPct[i - 1] ?? 0) >= CROSSING_END &&
      (lapDistPct[i] ?? 0) <= CROSSING_START;
    if (cruzou) starts.push(i);
  }

  return starts.map((start, indice) => {
    const proximo = starts[indice + 1];
    const end = (proximo ?? total) - 1;
    // A gravação corta a primeira e a última volta. Uma volta só, sem nenhum
    // cruzamento, é incompleta pelos dois lados.
    const complete = indice > 0 && proximo !== undefined;
    const flags = flagsOf(signals, start, end, complete);

    return {
      // O número vem do meio da volta, não das pontas: na virada o sim pode
      // publicar número e distância com um tick de diferença, e a primeira
      // amostra do arquivo às vezes sai zerada (ver docs/formato-ibt.md).
      number: lapNumber[Math.floor((start + end) / 2)] ?? 0,
      startSample: start,
      endSample: end,
      lapTimeSeconds: complete ? (end - start + 1) / tickRate : null,
      isComplete: complete,
      flags,
    };
  });
}
