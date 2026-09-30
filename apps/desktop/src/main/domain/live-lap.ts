/**
 * A volta em curso se desenhando, tick a tick, e a anterior ao lado.
 *
 * É visualização (ADR 0023): nada disto é gravado, e a análise continua saindo
 * do `.ibt`. A linha de chegada é a mesma regra do recorte do arquivo
 * (`detectLaps`): o número da volta subiu **e** a distância voltou do fim para o
 * começo — só que ao vivo os dois fatos podem chegar em ticks diferentes, então
 * vale o primeiro recuo de distância depois que o número subiu.
 *
 * O traço cresce **no lugar**: uma volta tem ~7 mil ticks, e copiar os arrays a
 * cada um custaria quadrático. Quem desenha lê `current` e `previous`, e não
 * guarda referência aos arrays esperando que não mudem.
 */
export interface LiveLapSample {
  readonly tickCount: number;
  readonly lap: number;
  readonly lapDistPct: number;
  /** Valor de cada canal pedido, na ordem da lista; `null` quando o carro não tem. */
  readonly values: readonly (number | null)[];
}

export interface LapTrace {
  readonly lap: number;
  /** Começou na linha de chegada: é uma volta inteira, não um pedaço. */
  readonly fromLine: boolean;
  readonly x: number[];
  /** Uma série por canal, alinhada com `x`. */
  readonly y: (number | null)[][];
}

export interface LiveLap {
  current: LapTrace | null;
  /** A última volta que começou e terminou na linha. */
  previous: LapTrace | null;
  lastTick: number | null;
}

export function createLiveLap(): LiveLap {
  return { current: null, previous: null, lastTick: null };
}

function startTrace(sample: LiveLapSample, fromLine: boolean): LapTrace {
  return {
    lap: sample.lap,
    fromLine,
    x: [sample.lapDistPct],
    y: sample.values.map((value) => [value]),
  };
}

/** Acrescenta um tick. Devolve se o desenho mudou. */
export function appendLiveSample(state: LiveLap, sample: LiveLapSample): boolean {
  const previousTick = state.lastTick;
  state.lastTick = sample.tickCount;
  // Fora do mundo (garagem, reset) o sim escreve distância negativa: não é ponto.
  if (sample.lapDistPct < 0) return false;

  const { current } = state;
  // Contagem de ticks ou de voltas que andou para trás é sessão nova: recomeça.
  if (
    current === null ||
    sample.lap < current.lap ||
    (previousTick !== null && sample.tickCount < previousTick)
  ) {
    state.current = startTrace(sample, false);
    state.previous = null;
    return true;
  }

  const lastX = current.x.at(-1) ?? 0;
  if (sample.lap > current.lap && sample.lapDistPct < lastX) {
    // Cruzou a linha. A volta que acabou só vira "anterior" se é inteira.
    const crossedOnce = sample.lap === current.lap + 1;
    if (current.fromLine && crossedOnce) state.previous = current;
    state.current = startTrace(sample, crossedOnce);
    return true;
  }

  // O eixo é a distância: ponto que anda para trás (carro de ré, o tick que
  // ainda não virou a volta) não entra, senão a linha dobra sobre si mesma.
  if (sample.lapDistPct < lastX) return false;

  current.x.push(sample.lapDistPct);
  current.y.forEach((serie, index) => serie.push(sample.values[index] ?? null));
  return true;
}
