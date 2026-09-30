/**
 * O overlay por cima do sim (ADR 0025): o que o processo principal monta a cada
 * tick e a configuração que o piloto escolhe.
 *
 * Só tipos e os valores padrão: main, preload e renderer compilam juntos.
 */

export const WIDGET_IDS = [
  'relative',
  'standings',
  'delta',
  'inputs',
  'fuel',
  'radar',
  'flag',
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

export function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === 'string' && (WIDGET_IDS as readonly string[]).includes(value);
}

// --- o quadro ----------------------------------------------------------------

export interface LicenseDto {
  readonly letter: string;
  readonly safetyRating: number | null;
  readonly color: string | null;
}

/** Quem está no carro, como o sim declara. Base de toda linha de piloto. */
export interface DriverRowDto {
  readonly carIdx: number;
  readonly name: string;
  readonly carNumber: string;
  readonly carName: string;
  /** O modelo sem o fabricante: "296 GT3". */
  readonly carModel: string;
  /** Sigla do fabricante ("FER"), quando reconhecido no nome do carro. */
  readonly carMake: string | null;
  readonly carMakeName: string | null;
  readonly className: string;
  readonly classColor: string | null;
  readonly iRating: number | null;
  readonly license: LicenseDto | null;
  readonly isPlayer: boolean;
  readonly onPitRoad: boolean;
}

export interface RelativeRowDto extends DriverRowDto {
  /** Positivo: o carro está à frente do piloto na pista, a tantos segundos. */
  readonly gapSeconds: number | null;
  /** A mesma distância em metros, quando o comprimento da pista é conhecido. */
  readonly gapMeters: number | null;
  /** Voltas a mais que o piloto na sessão. Só tem sentido na corrida. */
  readonly lapsAhead: number;
  readonly classPosition: number | null;
}

export type GapDto =
  | { readonly kind: 'time'; readonly seconds: number }
  | { readonly kind: 'laps'; readonly laps: number };

export interface StandingRowDto extends DriverRowDto {
  readonly classPosition: number;
  readonly gap: GapDto | null;
  readonly interval: GapDto | null;
  readonly lastLapTime: number | null;
  readonly bestLapTime: number | null;
  readonly hasClassBestLap: boolean;
}

export interface ClassStandingsDto {
  readonly classId: number;
  readonly className: string;
  readonly classColor: string | null;
  readonly strengthOfField: number | null;
  readonly rows: readonly StandingRowDto[];
}

export interface OverlaySessionDto {
  readonly trackName: string;
  readonly sessionType: string | null;
  readonly isRace: boolean;
  /** `null` quando a sessão não tem fim por tempo. */
  readonly timeRemainingSeconds: number | null;
  /** `null` quando a sessão não tem fim por voltas. */
  readonly lapsRemaining: number | null;
  /** Mais de uma classe no grid: aí a cor da classe aparece. */
  readonly multiClass: boolean;
  /** Mais de um carro no grid: aí o modelo aparece. */
  readonly multiCar: boolean;
  /** Mais de um fabricante no grid: aí a marca aparece. */
  readonly multiMake: boolean;
  readonly airTempCelsius: number | null;
  readonly trackTempCelsius: number | null;
  readonly incidents: number | null;
}

/**
 * Contra o quê o sim calcula o delta. Todos são por distância — tempo desta
 * volta ao chegar num ponto menos o da referência no mesmo ponto — e acumulam:
 * parado, o delta cresce um segundo por segundo (conferido em `.ibt` real,
 * `docs/formato-ibt.md`).
 *
 * `best` e `optimal` **não são da sessão**: são a melhor volta e a volta ideal
 * de todos os tempos com este carro nesta pista, que o iRacing guarda em
 * `DocumentosiRacinglapfiles` (`.blap` e `.olap`).
 */
export type DeltaReference = 'best' | 'optimal' | 'session-best' | 'session-optimal' | 'session-last';

export interface FuelDto {
  readonly fuelLevel: number;
  readonly lastLapUsage: number | null;
  readonly averageUsage: number | null;
  readonly lapsOfFuel: number | null;
  readonly lapsRemaining: number | null;
  readonly fuelToFinish: number | null;
  readonly measuredLaps: number;
  readonly capacityLiters: number | null;
}

export type FlagDto =
  | 'checkered'
  | 'white'
  | 'green'
  | 'yellow'
  | 'red'
  | 'blue'
  | 'debris'
  | 'black'
  | 'repair'
  | 'furled'
  | 'disqualify';

/** O "spotter" do sim: de que lado há carro. */
export type SideDto = 'clear' | 'left' | 'right' | 'both' | 'two-left' | 'two-right';

export interface NearbyCarDto {
  readonly carIdx: number;
  /** Positivo: à frente. */
  readonly meters: number;
}

export interface PlayerDto {
  readonly carIdx: number;
  readonly currentLapTime: number | null;
  readonly lastLapTime: number | null;
  readonly bestLapTime: number | null;
  /** Delta que o próprio sim calcula, contra cada referência dele. `null` quando ele diz que não vale. */
  readonly delta: Readonly<Record<DeltaReference, number | null>>;
  readonly fuel: FuelDto | null;
  readonly flags: readonly FlagDto[];
  readonly side: SideDto | null;
  /** Carros na pista perto do piloto, pela distância. */
  readonly nearby: readonly NearbyCarDto[];
  readonly speedMs: number | null;
  readonly gear: number | null;
  readonly isOnTrack: boolean;
}

export type OverlayFrameDto =
  | { readonly state: 'sim-closed' }
  | { readonly state: 'disconnected' }
  | {
      readonly state: 'connected';
      readonly tickCount: number;
      readonly session: OverlaySessionDto;
      readonly player: PlayerDto | null;
      /** Só quando o widget pediu. Na ordem da pista, do mais à frente ao mais atrás. */
      readonly relative: readonly RelativeRowDto[] | null;
      /** Só quando o widget pediu. */
      readonly standings: readonly ClassStandingsDto[] | null;
    };

// --- a configuração ------------------------------------------------------------

export interface WidgetSettings {
  readonly enabled: boolean;
  /** Posição na tela, em pixels da área de trabalho. `null`: a posição padrão. */
  readonly x: number | null;
  readonly y: number | null;
  readonly scale: number;
}

export interface DriverColumns {
  readonly carNumber: boolean;
  readonly make: boolean;
  readonly model: boolean;
  readonly license: boolean;
  readonly iRating: boolean;
}

export interface OverlaySettings {
  /** O overlay inteiro ligado. */
  readonly visible: boolean;
  /** Janelas destravadas para mover. Nunca começa ligado. */
  readonly editing: boolean;
  /** Opacidade do fundo dos widgets, de 0,3 a 1. O texto fica sempre opaco. */
  readonly backgroundOpacity: number;
  readonly widgets: Readonly<Record<WidgetId, WidgetSettings>>;
  readonly relative: {
    readonly carsAhead: number;
    readonly carsBehind: number;
    readonly columns: DriverColumns;
  };
  readonly standings: {
    /** Quantos do topo da classe do piloto aparecem sempre. */
    readonly leaders: number;
    /** Quantos acima e abaixo do piloto. */
    readonly aroundPlayer: number;
    /** Quantos do topo de cada outra classe. */
    readonly otherClasses: number;
    readonly columns: DriverColumns & {
      readonly lastLap: boolean;
      readonly bestLap: boolean;
      readonly gap: boolean;
      readonly interval: boolean;
    };
  };
  readonly delta: { readonly reference: DeltaReference };
  readonly inputs: { readonly seconds: number };
  readonly radar: { readonly rangeMeters: number };
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type OverlaySettingsPatch = DeepPartial<OverlaySettings>;

const widget = (enabled: boolean): WidgetSettings => ({ enabled, x: null, y: null, scale: 1 });

/**
 * O que o piloto vê na primeira vez. São escolhas de apresentação, não de
 * análise: poucos widgets ligados, para a tela não nascer poluída — o relative,
 * a classificação, o delta, os pedais e a bandeira (que só aparece quando há
 * bandeira). Combustível e radar ficam a um clique.
 */
export const DEFAULT_OVERLAY_SETTINGS: OverlaySettings = {
  visible: true,
  editing: false,
  backgroundOpacity: 0.82,
  widgets: {
    relative: widget(true),
    standings: widget(true),
    delta: widget(true),
    inputs: widget(true),
    fuel: widget(false),
    radar: widget(false),
    flag: widget(true),
  },
  relative: {
    carsAhead: 3,
    carsBehind: 3,
    columns: { carNumber: true, make: true, model: false, license: true, iRating: true },
  },
  standings: {
    leaders: 3,
    aroundPlayer: 3,
    otherClasses: 3,
    columns: {
      carNumber: true,
      make: true,
      model: true,
      license: true,
      iRating: true,
      lastLap: true,
      bestLap: false,
      gap: true,
      interval: false,
    },
  },
  // A melhor volta desta sessão: contra a de todos os tempos, quem volta à pista
  // depois de semanas vê o delta vermelho a volta inteira e não aprende nada.
  delta: { reference: 'session-best' },
  inputs: { seconds: 5 },
  radar: { rangeMeters: 40 },
};
