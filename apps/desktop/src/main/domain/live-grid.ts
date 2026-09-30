import { type GridDriver, isCompetitor } from './driver.js';

/**
 * O grid num instante: onde cada carro está e o que o sim já cronometrou dele.
 *
 * Tudo vem pronto dos canais `CarIdx*` do sim (ADR 0025): esta camada ordena e
 * subtrai, nunca estima. Função pura, sem canal por nome — quem traduz o
 * vocabulário do iRacing é `live/overlay-feed.ts`.
 */
export type TrackPresence = 'not-in-world' | 'off-track' | 'pit-stall' | 'approaching-pits' | 'on-track';

export interface CarState {
  readonly carIdx: number;
  /** Volta que o carro está rodando (`CarIdxLap`). */
  readonly lap: number;
  /** Voltas que ele já completou (`CarIdxLapCompleted`). */
  readonly lapsCompleted: number;
  /** Onde ele está na volta, de 0 a 1. Negativo quando não está no mundo. */
  readonly lapDistPct: number;
  readonly presence: TrackPresence;
  readonly onPitRoad: boolean;
  /** Posição geral; 0 quando o sim ainda não classificou o carro. */
  readonly position: number;
  /** Posição na classe; 0 quando o sim ainda não classificou o carro. */
  readonly classPosition: number;
  /** Tempo estimado até o ponto da pista onde o carro está (`CarIdxEstTime`). */
  readonly estTime: number;
  /** Na corrida, atrás do líder, em segundos (`CarIdxF2Time`). */
  readonly f2Time: number;
  readonly lastLapTime: number | null;
  readonly bestLapTime: number | null;
}

/** O carro está no mundo do sim, com posição na pista. */
export function isInWorld(car: CarState): boolean {
  return car.presence !== 'not-in-world' && car.lapDistPct >= 0;
}

/** Distância percorrida na sessão, em voltas. Só compara carros no mundo. */
function progress(car: CarState): number {
  return car.lapsCompleted + car.lapDistPct;
}

/**
 * A diferença de posição na pista de `a` para `b`, em fração de volta, levada
 * para (-½, ½]: o caminho mais curto no círculo. Positivo é `a` à frente.
 *
 * Meia volta não é limiar escolhido: é onde "à frente" e "atrás" trocam de
 * sentido num circuito fechado.
 */
export function trackOffset(a: number, b: number): number {
  let offset = a - b;
  while (offset > 0.5) offset -= 1;
  while (offset <= -0.5) offset += 1;
  return offset;
}

// --- relative -----------------------------------------------------------------

export interface RelativeEntry {
  readonly carIdx: number;
  /** Onde o carro está em relação ao piloto, em fração de volta. Positivo: à frente. */
  readonly offset: number;
  /**
   * Segundos até o piloto chegar onde o carro está (positivo, carro à frente) ou
   * até o carro chegar onde o piloto está (negativo, carro atrás). `null` sem o
   * tempo estimado da volta.
   */
  readonly gapSeconds: number | null;
  /**
   * Quantas voltas o carro tem a mais que o piloto na sessão. Positivo: ele está
   * uma volta à frente (vai colocar volta); negativo: o piloto vai colocar volta
   * nele. Zero: disputa a mesma volta.
   */
  readonly lapsAhead: number;
}

/**
 * Os carros na ordem em que estão na pista, do mais à frente ao mais atrás do
 * piloto, com ele no meio.
 *
 * A ordem sai da distância na pista (`lapDistPct`), que é fato. O gap em
 * segundos sai do `CarIdxEstTime` do sim — o tempo que o carro de referência da
 * classe leva do começo da volta até cada ponto —, como o relative do próprio
 * sim; na linha de chegada ele dá a volta com o tempo estimado da volta da
 * classe do piloto.
 */
export function relativeOrder(
  cars: readonly CarState[],
  drivers: ReadonlyMap<number, GridDriver>,
  playerCarIdx: number,
  lapEstimate: number | null,
): RelativeEntry[] {
  const player = cars.find((car) => car.carIdx === playerCarIdx);
  if (player === undefined || !isInWorld(player)) return [];

  const entries = cars
    .filter((car) => {
      if (car.carIdx === playerCarIdx) return true;
      const driver = drivers.get(car.carIdx);
      return driver !== undefined && isCompetitor(driver) && isInWorld(car);
    })
    .map((car): RelativeEntry => {
      const offset = car.carIdx === playerCarIdx ? 0 : trackOffset(car.lapDistPct, player.lapDistPct);
      return {
        carIdx: car.carIdx,
        offset,
        gapSeconds: lapEstimate === null ? null : wrapTime(car.estTime - player.estTime, offset, lapEstimate),
        // A diferença de progresso menos o que é só posição na volta: sobra um
        // número inteiro de voltas.
        // `|| 0`: o arredondamento de um resíduo negativo dá -0.
        lapsAhead: Math.round(progress(car) - progress(player) - offset) || 0,
      };
    });

  return entries.sort((a, b) => b.offset - a.offset);
}

/**
 * O gap do `EstTime` do lado certo da linha de chegada. Quando o carro está à
 * frente na pista mas já cruzou a linha (e o piloto não), a diferença crua sai
 * negativa; somar uma volta estimada a traz para o sentido da posição na pista.
 */
function wrapTime(raw: number, offset: number, lapEstimate: number): number {
  let gap = raw;
  if (offset > 0 && gap < 0) gap += lapEstimate;
  if (offset < 0 && gap > 0) gap -= lapEstimate;
  return gap;
}

// --- classificação ------------------------------------------------------------

export type Gap =
  | { readonly kind: 'time'; readonly seconds: number }
  | { readonly kind: 'laps'; readonly laps: number };

export interface StandingEntry {
  readonly carIdx: number;
  /** Posição na classe, como a tela mostra: 1, 2, 3… na ordem da lista. */
  readonly classPosition: number;
  readonly position: number;
  /** Atrás do líder da classe. `null` para o próprio líder e para quem não tem tempo. */
  readonly gap: Gap | null;
  /** Atrás do carro imediatamente à frente na classe. */
  readonly interval: Gap | null;
  readonly lastLapTime: number | null;
  readonly bestLapTime: number | null;
  readonly lapsCompleted: number;
  readonly onPitRoad: boolean;
  /** Fez a melhor volta da classe. */
  readonly hasClassBestLap: boolean;
}

export interface ClassStandings {
  readonly classId: number;
  readonly className: string;
  readonly classColor: string | null;
  /** Strength of field da classe. `null` sem iRating conhecido. */
  readonly strengthOfField: number | null;
  readonly entries: readonly StandingEntry[];
}

/**
 * A classificação por classe.
 *
 * Na corrida, a ordem é a do sim (`CarIdxClassPosition`), e o gap é o do sim
 * (`CarIdxF2Time`) ou, para quem está a uma volta ou mais, a diferença em
 * voltas. Fora da corrida — treino, classificação —, a ordem e o gap saem da
 * melhor volta, que é o que decide essas sessões.
 *
 * Carro sem posição (ainda não cronometrou) vai para o fim da classe, na ordem
 * do número do `CarIdx`, sem gap.
 */
export function standings(
  cars: readonly CarState[],
  drivers: ReadonlyMap<number, GridDriver>,
  isRace: boolean,
): ClassStandings[] {
  const byClass = new Map<number, { driver: GridDriver; car: CarState }[]>();
  for (const car of cars) {
    const driver = drivers.get(car.carIdx);
    if (driver === undefined || !isCompetitor(driver)) continue;
    const list = byClass.get(driver.classId) ?? [];
    list.push({ driver, car });
    byClass.set(driver.classId, list);
  }

  const classes = [...byClass.values()].map((list): ClassStandings => {
    const ordered = [...list].sort((a, b) => compareInClass(a.car, b.car, isRace));
    const classBest = Math.min(...ordered.map(({ car }) => car.bestLapTime ?? Infinity));
    const leader = ordered[0]?.car;

    const entries = ordered.map(({ car }, index): StandingEntry => {
      const ahead = index > 0 ? ordered[index - 1]?.car : undefined;
      return {
        carIdx: car.carIdx,
        classPosition: index + 1,
        position: car.position,
        gap: leader === undefined || index === 0 ? null : gapBetween(car, leader, isRace),
        interval: ahead === undefined ? null : gapBetween(car, ahead, isRace),
        lastLapTime: car.lastLapTime,
        bestLapTime: car.bestLapTime,
        lapsCompleted: car.lapsCompleted,
        onPitRoad: car.onPitRoad,
        hasClassBestLap: car.bestLapTime !== null && car.bestLapTime === classBest,
      };
    });

    const first = ordered[0]?.driver;
    return {
      classId: first?.classId ?? 0,
      className: first?.className ?? '',
      classColor: first?.classColor ?? null,
      strengthOfField: strengthOfField(ordered.map(({ driver }) => driver.iRating)),
      entries,
    };
  });

  // Classe mais rápida primeiro, como o sim lista: a de menor volta estimada.
  const estimate = (classId: number) =>
    [...drivers.values()].find((driver) => driver.classId === classId)?.classEstLapTime ?? Infinity;
  return classes.sort((a, b) => estimate(a.classId) - estimate(b.classId));
}

function compareInClass(a: CarState, b: CarState, isRace: boolean): number {
  const rank = (car: CarState) => (car.classPosition > 0 ? car.classPosition : Infinity);
  if (isRace) {
    return rank(a) - rank(b) || a.carIdx - b.carIdx;
  }
  const best = (car: CarState) => car.bestLapTime ?? Infinity;
  return best(a) - best(b) || rank(a) - rank(b) || a.carIdx - b.carIdx;
}

/** Quanto `car` está atrás de `ahead`. */
function gapBetween(car: CarState, ahead: CarState, isRace: boolean): Gap | null {
  if (!isRace) {
    if (car.bestLapTime === null || ahead.bestLapTime === null) return null;
    return { kind: 'time', seconds: car.bestLapTime - ahead.bestLapTime };
  }
  if (car.classPosition <= 0 || ahead.classPosition <= 0) return null;
  // Uma volta inteira de distância, no mínimo: aí o tempo deixa de ser a medida.
  if (isInWorld(car) && isInWorld(ahead)) {
    const laps = Math.floor(progress(ahead) - progress(car));
    if (laps >= 1) return { kind: 'laps', laps };
  }
  const seconds = car.f2Time - ahead.f2Time;
  return seconds >= 0 ? { kind: 'time', seconds } : null;
}

/**
 * Strength of field: a média exponencial dos iRatings,
 * `1600/ln 2 · ln(n / Σ exp(−iR · ln 2 / 1600))`.
 *
 * É a fórmula que a comunidade usa e que reproduz o SOF dos resultados
 * oficiais; o 1600 é a escala do próprio iRating, não escolha daqui. Ainda não
 * foi conferida contra um resultado (docs/pendencias.md, item 15). Quem não tem
 * iRating (`null` ou 0) fica de fora da média.
 */
export function strengthOfField(iRatings: readonly (number | null)[]): number | null {
  const known = iRatings.filter((ir): ir is number => ir !== null && ir > 0);
  if (known.length === 0) return null;
  const scale = 1600 / Math.LN2;
  const sum = known.reduce((total, ir) => total + Math.exp(-ir / scale), 0);
  return scale * Math.log(known.length / sum);
}
