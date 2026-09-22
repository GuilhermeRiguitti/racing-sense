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
 * A linha de chegada, sem limiar.
 *
 * Cruzar a linha é a coincidência de dois fatos do arquivo: o número da volta
 * subiu **e** a distância andou para trás (de ~1 para ~0). Nenhum número entra.
 *
 * A versão anterior exigia "a distância estava acima de 0,9 e caiu abaixo de
 * 0,1". Funcionava, mas eram dois números escolhidos por mim. Conferido nos oito
 * arquivos reais, a regra sem limiar marca exatamente os mesmos cruzamentos —
 * e ela continua descartando os três casos que motivaram a histerese: a
 * gravação que começa no meio da sessão e a primeira amostra zerada (o número
 * sobe, mas a distância também sobe), e a manobra por cima da linha na box (a
 * distância recua, mas o número não sobe).
 */

function flagsOf(signals: LapSignals, start: number, end: number, complete: boolean): LapFlag[] {
  const flags: LapFlag[] = [];
  if (!complete) flags.push('incomplete');

  const { onPitRoad, offTrack, incidentCount } = signals;
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
  return flags;
}

/**
 * Recorta as amostras em voltas.
 *
 * A linha de chegada é reconhecida pela coincidência de dois fatos do arquivo,
 * nunca por um só — ver o comentário acima de `detectLaps`.
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
      (lapDistPct[i] ?? 0) < (lapDistPct[i - 1] ?? 0);
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
