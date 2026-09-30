/**
 * Quanto combustível o carro gasta por volta, contado ao vivo.
 *
 * O sim entrega o nível do tanque (`FuelLevel`), não o gasto por volta. A conta
 * é a mais simples que existe: o nível ao cruzar a linha menos o nível ao cruzar
 * de novo. Só entra volta **limpa de reabastecimento** — a que passou pelo box
 * pode ter recebido combustível e daria gasto negativo ou pequeno demais.
 *
 * A média é a da stint inteira (desde o último reabastecimento), sem janela das
 * últimas N voltas: N seria um número escolhido (regra 18). Redutor puro: quem
 * observa os ticks guarda o estado e o passa de volta.
 */
export interface FuelSample {
  readonly lapsCompleted: number;
  readonly fuelLevel: number;
  readonly onPitRoad: boolean;
}

export interface FuelUsageState {
  readonly lapsCompleted: number | null;
  /** Nível no começo da volta em curso; `null` quando ela não começou na linha. */
  readonly fuelAtLapStart: number | null;
  /** A volta em curso passou pelo box ou recebeu combustível. */
  readonly lapTouchedPit: boolean;
  readonly lastFuelLevel: number | null;
  /** Gasto de cada volta limpa da stint, em litros, na ordem. */
  readonly stintLaps: readonly number[];
}

export const EMPTY_FUEL_USAGE: FuelUsageState = {
  lapsCompleted: null,
  fuelAtLapStart: null,
  lapTouchedPit: false,
  lastFuelLevel: null,
  stintLaps: [],
};

export function observeFuel(state: FuelUsageState, sample: FuelSample): FuelUsageState {
  const refueled = state.lastFuelLevel !== null && sample.fuelLevel > state.lastFuelLevel;
  // Tanque que subiu é stint nova: o gasto da anterior não diz nada desta.
  const stintLaps = refueled ? [] : state.stintLaps;
  const touched = state.lapTouchedPit || sample.onPitRoad || refueled;

  if (state.lapsCompleted === null || sample.lapsCompleted < state.lapsCompleted) {
    // Primeiro tick observado, ou sessão nova (o contador voltou): a volta em
    // curso não começou na linha à vista de ninguém.
    return {
      lapsCompleted: sample.lapsCompleted,
      fuelAtLapStart: null,
      lapTouchedPit: sample.onPitRoad,
      lastFuelLevel: sample.fuelLevel,
      stintLaps: sample.lapsCompleted < (state.lapsCompleted ?? 0) ? [] : stintLaps,
    };
  }

  if (sample.lapsCompleted === state.lapsCompleted) {
    return { ...state, lapTouchedPit: touched, lastFuelLevel: sample.fuelLevel, stintLaps };
  }

  // Cruzou a linha. Só mede se viu a volta inteira: se pulou uma volta (tela
  // fechada), o nível do começo é de outra volta.
  const sawWholeLap = sample.lapsCompleted === state.lapsCompleted + 1;
  const used =
    sawWholeLap && state.fuelAtLapStart !== null && !touched
      ? state.fuelAtLapStart - sample.fuelLevel
      : null;
  return {
    lapsCompleted: sample.lapsCompleted,
    fuelAtLapStart: sample.fuelLevel,
    lapTouchedPit: sample.onPitRoad,
    lastFuelLevel: sample.fuelLevel,
    stintLaps: used !== null && used > 0 ? [...stintLaps, used] : stintLaps,
  };
}

export interface FuelEstimate {
  readonly fuelLevel: number;
  /** Gasto da última volta limpa. */
  readonly lastLapUsage: number | null;
  /** Média da stint. */
  readonly averageUsage: number | null;
  /** Quantas voltas o tanque atual rende, na média da stint. */
  readonly lapsOfFuel: number | null;
  /** Voltas que faltam na sessão, pelo sim. `null` quando a sessão não tem fim em voltas. */
  readonly lapsRemaining: number | null;
  /** Quanto falta pôr no tanque para terminar. Zero quando o que tem basta. */
  readonly fuelToFinish: number | null;
  readonly measuredLaps: number;
}

export function estimateFuel(
  state: FuelUsageState,
  fuelLevel: number,
  lapsRemaining: number | null,
): FuelEstimate {
  const laps = state.stintLaps;
  const averageUsage = laps.length === 0 ? null : laps.reduce((a, b) => a + b, 0) / laps.length;
  return {
    fuelLevel,
    lastLapUsage: laps.at(-1) ?? null,
    averageUsage,
    lapsOfFuel: averageUsage === null ? null : fuelLevel / averageUsage,
    lapsRemaining,
    fuelToFinish:
      averageUsage === null || lapsRemaining === null
        ? null
        : Math.max(0, lapsRemaining * averageUsage - fuelLevel),
    measuredLaps: laps.length,
  };
}
