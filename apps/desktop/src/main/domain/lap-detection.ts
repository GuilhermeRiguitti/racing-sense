import type { Lap, LapFlag } from './lap.js';

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
  /** Verdadeiro enquanto o sim mostra a advertência que acompanha o slow down. */
  readonly penalized?: readonly boolean[];
  /**
   * Falso quando o carro não estava no mundo do sim — não tinha posição. É o
   * caso da primeira amostra de muitos arquivos, gravada antes de o sim
   * preencher o buffer (ver `docs/formato-ibt.md`).
   */
  readonly inWorld?: readonly boolean[];
  /**
   * Contador de incidentes do piloto, por amostra. É acumulado na sessão do sim
   * — atravessa voltas e até arquivos —, e por isso a volta não o lê direto:
   * soma o quanto ele subiu dentro dela.
   */
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

  const { onPitRoad, offTrack, penalized } = signals;
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
  // Marca a volta em que a advertência esteve acesa, sem ligar de volta à saída
  // de pista que a causou: "a saída mais recente" não é sempre a causa (num
  // arquivo real ela acendeu 537 s depois da última), e decidir o que é
  // recente o bastante seria um limiar escolhido (ADR 0021).
  if (penalized !== undefined) {
    for (let i = start; i <= end; i += 1) {
      if (penalized[i] === true) {
        flags.push('slowdown');
        break;
      }
    }
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
  const { lapNumber, lapDistPct, tickRate, inWorld } = signals;

  // Amostra em que o carro não estava no mundo não tem posição, e não pertence
  // a volta nenhuma. Nas pontas da gravação ela é cortada — é o que tira a
  // amostra fantasma do começo do arquivo, que desenharia uma rampa de 0 m até
  // a primeira posição real que nunca aconteceu.
  let inicio = 0;
  let fim = lapNumber.length - 1;
  if (inWorld !== undefined) {
    while (inicio <= fim && inWorld[inicio] === false) inicio += 1;
    while (fim >= inicio && inWorld[fim] === false) fim -= 1;
  }
  const total = fim + 1;
  if (inicio > fim) return [];

  // Uma volta é um trecho em que o sim reporta o mesmo número de volta. Toda
  // mudança de número começa um trecho novo — não só o cruzamento da linha.
  //
  // A versão anterior só cortava no cruzamento e ignorava qualquer outra
  // mudança. Quando o contador do sim reinicia no meio do arquivo (sessão nova,
  // reset), isso colava o fim de uma volta com o começo de outra e marcava o
  // resultado como completo, com o dobro do tempo — uma volta que não existiu.
  const starts: number[] = [inicio];
  for (let i = inicio + 1; i < total; i += 1) {
    if (lapNumber[i] !== lapNumber[i - 1]) starts.push(i);
  }

  // O trecho começou num cruzamento da linha de chegada? É a coincidência de
  // dois fatos: o número subiu e a distância voltou do fim para o começo.
  const comecaNaLinha = (start: number): boolean =>
    start > inicio &&
    (lapNumber[start] ?? 0) > (lapNumber[start - 1] ?? 0) &&
    (lapDistPct[start] ?? 0) < (lapDistPct[start - 1] ?? 0);

  return starts.map((start, indice) => {
    const proximo = starts[indice + 1];
    const end = (proximo ?? total) - 1;
    // Completa só quando começa **e** termina na linha. Isso cobre a primeira e
    // a última da gravação (cortadas por ela) e a volta interrompida por uma
    // mudança de número que não foi cruzamento.
    const complete = comecaNaLinha(start) && proximo !== undefined && comecaNaLinha(proximo);
    const flags = flagsOf(signals, start, end, complete);

    return {
      // Constante dentro do trecho, por construção.
      number: lapNumber[start] ?? 0,
      startSample: start,
      endSample: end,
      lapTimeSeconds: complete ? (end - start + 1) / tickRate : null,
      isComplete: complete,
      flags,
      ...(signals.incidentCount !== undefined
        ? { incidents: incidentsIn(signals.incidentCount, start, end, inicio) }
        : {}),
    };
  });
}

/**
 * Quantos incidentes a volta somou: cada subida do contador, da amostra
 * anterior ao início da volta até a última dela.
 *
 * Soma as subidas em vez de fazer "fim menos começo" porque o contador pode
 * zerar no meio do arquivo (sessão nova do sim); a diferença daria negativo, e
 * a soma das subidas continua certa. A subida entre a última amostra de uma
 * volta e a primeira da seguinte é da seguinte — é quando ela foi registrada.
 */
function incidentsIn(contador: readonly number[], start: number, end: number, inicio: number): number {
  let total = 0;
  for (let i = Math.max(start, inicio + 1); i <= end; i += 1) {
    const subida = (contador[i] ?? 0) - (contador[i - 1] ?? 0);
    if (subida > 0) total += subida;
  }
  return total;
}
