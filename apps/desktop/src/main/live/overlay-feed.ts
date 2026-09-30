import type {
  ClassStandingsDto,
  DeltaReference,
  DriverRowDto,
  FlagDto,
  GapDto,
  NearbyCarDto,
  OverlayFrameDto,
  OverlaySessionDto,
  PlayerDto,
  RelativeRowDto,
  SideDto,
  WidgetId,
} from '../../shared/overlay.js';
import { type GridDriver, isCompetitor } from '../domain/driver.js';
import {
  EMPTY_FUEL_USAGE,
  estimateFuel,
  type FuelUsageState,
  observeFuel,
} from '../domain/fuel-usage.js';
import {
  type CarState,
  type Gap,
  isInWorld,
  relativeOrder,
  standings,
  type TrackPresence,
  trackOffset,
} from '../domain/live-grid.js';
import type { LiveValue } from '../ibt/live.js';
import {
  CAR_LEFT_RIGHT,
  SESSION_FLAG,
  TRACK_SURFACE,
  UNLIMITED_LAPS,
  UNLIMITED_TIME_SECONDS,
} from '../ibt/sdk-values.js';
import type { LiveCatalog, LiveTelemetry } from './live-telemetry.js';

/**
 * O quadro que as janelas do overlay desenham (ADR 0025).
 *
 * Lê o `snapshot` da leitura ao vivo **uma vez por tick** e guarda o resultado:
 * cinco janelas perguntando no mesmo tick custam uma leitura. Relative e
 * classificação só são montados quando alguém os pede.
 *
 * Aqui mora o vocabulário do iRacing — nome de canal, código de superfície, bit
 * de bandeira. As regras (ordem, gap, consumo) são as funções puras de
 * `domain/`. Canal que o sim não entrega vira `null`, e o widget diz que não há
 * dado; o overlay nunca quebra por um canal a menos.
 */
export interface OverlayFeed {
  frame(widget: WidgetId): OverlayFrameDto;
}

interface Tick {
  readonly catalog: LiveCatalog;
  readonly tickCount: number;
  readonly drivers: ReadonlyMap<number, GridDriver>;
  readonly session: OverlaySessionDto;
  readonly player: PlayerDto | null;
  readonly cars: readonly CarState[];
  relative?: readonly RelativeRowDto[];
  standings?: readonly ClassStandingsDto[];
}

const DELTA_CHANNELS: Record<DeltaReference, string> = {
  best: 'LapDeltaToBestLap',
  optimal: 'LapDeltaToOptimalLap',
  'session-best': 'LapDeltaToSessionBestLap',
  'session-optimal': 'LapDeltaToSessionOptimalLap',
  // A grafia do SDK é esta mesma, com o "l" a mais.
  'session-last': 'LapDeltaToSessionLastlLap',
};

export function createOverlayFeed(live: LiveTelemetry): OverlayFeed {
  let catalog: LiveCatalog | null = null;
  let index = new Map<string, number>();
  let drivers = new Map<number, GridDriver>();
  let current: Tick | null = null;
  let fuel: FuelUsageState = EMPTY_FUEL_USAGE;

  const read = (): Tick | { readonly state: 'sim-closed' | 'disconnected' } => {
    const snapshot = live.snapshot(catalog?.catalogId ?? null);
    if (snapshot.state !== 'connected') {
      catalog = null;
      current = null;
      fuel = EMPTY_FUEL_USAGE;
      return { state: snapshot.state };
    }
    if (snapshot.catalog !== null) {
      catalog = snapshot.catalog;
      index = new Map(catalog.channels.map((channel, i) => [channel.name, i]));
      drivers = new Map(catalog.drivers.map((driver) => [driver.carIdx, driver]));
    }
    if (catalog === null) return { state: 'disconnected' };
    if (current !== null && current.tickCount === snapshot.tickCount && current.catalog === catalog) {
      return current;
    }

    const channels = channelReader(snapshot.values, index);
    const cars = carStates(channels, drivers);
    const playerCarIdx = catalog.playerCarIdx;

    const lapsCompleted = channels.scalar('LapCompleted');
    const fuelLevel = channels.scalar('FuelLevel');
    if (lapsCompleted !== null && fuelLevel !== null) {
      fuel = observeFuel(fuel, {
        lapsCompleted,
        fuelLevel,
        onPitRoad: channels.flag('OnPitRoad') ?? false,
      });
    }

    const session = sessionOf(catalog, channels, drivers);
    current = {
      catalog,
      tickCount: snapshot.tickCount,
      drivers,
      session,
      cars,
      player:
        playerCarIdx === null
          ? null
          : playerOf(playerCarIdx, catalog, channels, cars, drivers, fuel, session),
    };
    return current;
  };

  return {
    frame(widget) {
      const tick = read();
      if (!('tickCount' in tick)) return tick;

      if ((widget === 'relative' || widget === 'radar') && tick.relative === undefined) {
        tick.relative = relativeRows(tick);
      }
      if (widget === 'standings' && tick.standings === undefined) {
        tick.standings = standingRows(tick);
      }
      return {
        state: 'connected',
        tickCount: tick.tickCount,
        session: tick.session,
        player: tick.player,
        relative: widget === 'relative' || widget === 'radar' ? (tick.relative ?? null) : null,
        standings: widget === 'standings' ? (tick.standings ?? null) : null,
      };
    },
  };
}

// --- canais por nome ------------------------------------------------------------

interface ChannelReader {
  scalar(name: string): number | null;
  flag(name: string): boolean | null;
  perCar(name: string): readonly number[] | null;
}

function channelReader(values: readonly LiveValue[], index: ReadonlyMap<string, number>): ChannelReader {
  const raw = (name: string) => {
    const at = index.get(name);
    return at === undefined ? undefined : values[at];
  };
  return {
    scalar(name) {
      const value = raw(name);
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    },
    flag(name) {
      const value = raw(name);
      return typeof value === 'number' ? value !== 0 : null;
    },
    perCar(name) {
      const value = raw(name);
      return Array.isArray(value) ? value : null;
    },
  };
}

const PRESENCE: Record<number, TrackPresence> = {
  [TRACK_SURFACE.notInWorld]: 'not-in-world',
  [TRACK_SURFACE.offTrack]: 'off-track',
  [TRACK_SURFACE.inPitStall]: 'pit-stall',
  [TRACK_SURFACE.approachingPits]: 'approaching-pits',
  [TRACK_SURFACE.onTrack]: 'on-track',
};

/** Tempo que o sim escreve como "não tem" (-1, 0) vira `null`. */
const lapTime = (value: number | undefined) =>
  value === undefined || !Number.isFinite(value) || value <= 0 ? null : value;

/** Um `CarState` por carro que a session info declara. */
function carStates(channels: ChannelReader, drivers: ReadonlyMap<number, GridDriver>): CarState[] {
  const lap = channels.perCar('CarIdxLap');
  const completed = channels.perCar('CarIdxLapCompleted');
  const pct = channels.perCar('CarIdxLapDistPct');
  const surface = channels.perCar('CarIdxTrackSurface');
  const pit = channels.perCar('CarIdxOnPitRoad');
  const position = channels.perCar('CarIdxPosition');
  const classPosition = channels.perCar('CarIdxClassPosition');
  const est = channels.perCar('CarIdxEstTime');
  const f2 = channels.perCar('CarIdxF2Time');
  const last = channels.perCar('CarIdxLastLapTime');
  const best = channels.perCar('CarIdxBestLapTime');
  if (pct === null) return [];

  return [...drivers.keys()].map((carIdx) => {
    const surfaceCode = surface?.[carIdx];
    const distPct = pct[carIdx] ?? -1;
    return {
      carIdx,
      lap: lap?.[carIdx] ?? 0,
      lapsCompleted: completed?.[carIdx] ?? 0,
      lapDistPct: distPct,
      // Sem o canal de superfície, estar com posição na pista é estar no mundo.
      presence:
        surfaceCode === undefined
          ? distPct >= 0
            ? 'on-track'
            : 'not-in-world'
          : (PRESENCE[surfaceCode] ?? 'not-in-world'),
      onPitRoad: (pit?.[carIdx] ?? 0) !== 0,
      position: position?.[carIdx] ?? 0,
      classPosition: classPosition?.[carIdx] ?? 0,
      estTime: est?.[carIdx] ?? 0,
      f2Time: f2?.[carIdx] ?? 0,
      lastLapTime: lapTime(last?.[carIdx]),
      bestLapTime: lapTime(best?.[carIdx]),
    };
  });
}

// --- sessão e piloto --------------------------------------------------------------

function sessionOf(
  catalog: LiveCatalog,
  channels: ChannelReader,
  drivers: ReadonlyMap<number, GridDriver>,
): OverlaySessionDto {
  const sessionNum = channels.scalar('SessionNum');
  const sessionType =
    (sessionNum === null ? undefined : catalog.sessionTypes.get(sessionNum)) ?? catalog.sessionType;
  const competitors = [...drivers.values()].filter(isCompetitor);
  const distinct = (key: (driver: GridDriver) => string | number) =>
    new Set(competitors.map(key)).size > 1;

  const time = channels.scalar('SessionTimeRemain');
  const laps = channels.scalar('SessionLapsRemainEx');
  return {
    trackName: catalog.track.name,
    sessionType,
    isRace: sessionType !== null && /race/i.test(sessionType),
    timeRemainingSeconds: time === null || time < 0 || time >= UNLIMITED_TIME_SECONDS ? null : time,
    lapsRemaining: laps === null || laps < 0 || laps >= UNLIMITED_LAPS ? null : laps,
    multiClass: distinct((driver) => driver.classId),
    multiMake: distinct((driver) => driver.car.make?.id ?? driver.car.name),
    airTempCelsius: channels.scalar('AirTemp'),
    trackTempCelsius: channels.scalar('TrackTempCrew') ?? channels.scalar('TrackTemp'),
    incidents: channels.scalar('PlayerCarMyIncidentCount'),
  };
}

function playerOf(
  playerCarIdx: number,
  catalog: LiveCatalog,
  channels: ChannelReader,
  cars: readonly CarState[],
  drivers: ReadonlyMap<number, GridDriver>,
  fuel: FuelUsageState,
  session: OverlaySessionDto,
): PlayerDto {
  const delta = Object.fromEntries(
    Object.entries(DELTA_CHANNELS).map(([reference, name]) => {
      const ok = channels.flag(`${name}_OK`);
      return [reference, ok === false ? null : channels.scalar(name)];
    }),
  ) as Record<DeltaReference, number | null>;

  const fuelLevel = channels.scalar('FuelLevel');
  const estimate = fuelLevel === null ? null : estimateFuel(fuel, fuelLevel, session.lapsRemaining);

  const player = cars.find((car) => car.carIdx === playerCarIdx);
  const trackLength = catalog.track.lengthMeters;
  const nearby: NearbyCarDto[] =
    player === undefined || !isInWorld(player) || trackLength === null
      ? []
      : cars
          .filter((car) => {
            const driver = drivers.get(car.carIdx);
            return (
              car.carIdx !== playerCarIdx &&
              driver !== undefined &&
              isCompetitor(driver) &&
              isInWorld(car) &&
              !car.onPitRoad
            );
          })
          .map((car) => ({
            carIdx: car.carIdx,
            meters: trackOffset(car.lapDistPct, player.lapDistPct) * trackLength,
          }))
          .sort((a, b) => Math.abs(a.meters) - Math.abs(b.meters));

  // O sim continua contando `LapCurrentLapTime` depois do Esc (garagem) e com o
  // carro parado na vaga, e só zera quando ele sai do box. Aí não há volta em
  // andamento: o tempo não aparece. Na corrida, a parada no box faz parte da
  // volta, e o tempo continua.
  const onTrack = channels.flag('IsOnTrack');
  const lapInProgress =
    onTrack !== false &&
    player !== undefined &&
    isInWorld(player) &&
    (session.isRace || player.presence !== 'pit-stall');

  return {
    carIdx: playerCarIdx,
    currentLapTime: lapInProgress ? channels.scalar('LapCurrentLapTime') : null,
    lastLapTime: lapTime(channels.scalar('LapLastLapTime') ?? undefined),
    bestLapTime: lapTime(channels.scalar('LapBestLapTime') ?? undefined),
    delta,
    fuel:
      estimate === null
        ? null
        : { ...estimate, capacityLiters: catalog.carLimits.fuelCapacityLiters },
    flags: flagsOf(channels.scalar('SessionFlags')),
    side: sideOf(channels.scalar('CarLeftRight')),
    nearby,
    speedMs: channels.scalar('Speed'),
    gear: channels.scalar('Gear'),
    isOnTrack: onTrack ?? false,
  };
}

/** As bandeiras acesas para o piloto, do bitfield `SessionFlags`. */
function flagsOf(bits: number | null): FlagDto[] {
  if (bits === null) return [];
  // Bitfield chega como int32: o bit 31 (largada) vem negativo sem isto.
  const on = (mask: number) => ((bits >>> 0) & mask) >>> 0 !== 0;
  const flags: FlagDto[] = [];
  if (on(SESSION_FLAG.disqualify)) flags.push('disqualify');
  if (on(SESSION_FLAG.black)) flags.push('black');
  if (on(SESSION_FLAG.repair)) flags.push('repair');
  if (on(SESSION_FLAG.furled)) flags.push('furled');
  if (on(SESSION_FLAG.red)) flags.push('red');
  if (on(SESSION_FLAG.checkered)) flags.push('checkered');
  if (
    on(SESSION_FLAG.yellow) ||
    on(SESSION_FLAG.yellowWaving) ||
    on(SESSION_FLAG.caution) ||
    on(SESSION_FLAG.cautionWaving)
  ) {
    flags.push('yellow');
  }
  if (on(SESSION_FLAG.blue)) flags.push('blue');
  if (on(SESSION_FLAG.debris)) flags.push('debris');
  if (on(SESSION_FLAG.white)) flags.push('white');
  if (on(SESSION_FLAG.green)) flags.push('green');
  return flags;
}

function sideOf(code: number | null): SideDto | null {
  switch (code) {
    case CAR_LEFT_RIGHT.clear:
      return 'clear';
    case CAR_LEFT_RIGHT.carLeft:
      return 'left';
    case CAR_LEFT_RIGHT.carRight:
      return 'right';
    case CAR_LEFT_RIGHT.carLeftRight:
      return 'both';
    case CAR_LEFT_RIGHT.twoCarsLeft:
      return 'two-left';
    case CAR_LEFT_RIGHT.twoCarsRight:
      return 'two-right';
    default:
      return null;
  }
}

// --- linhas ----------------------------------------------------------------------

function driverRow(tick: Tick, carIdx: number): DriverRowDto | null {
  const driver = tick.drivers.get(carIdx);
  if (driver === undefined) return null;
  const car = tick.cars.find((c) => c.carIdx === carIdx);
  return {
    carIdx,
    name: driver.name,
    carNumber: driver.carNumber,
    carName: driver.car.name,
    carMake: driver.car.make,
    className: driver.className,
    classColor: driver.classColor,
    iRating: driver.iRating,
    license: driver.license === null ? null : { ...driver.license },
    isPlayer: carIdx === tick.catalog.playerCarIdx,
    onPitRoad: car?.onPitRoad ?? false,
  };
}

function relativeRows(tick: Tick): RelativeRowDto[] {
  const playerCarIdx = tick.catalog.playerCarIdx;
  if (playerCarIdx === null) return [];
  const lapEstimate = tick.drivers.get(playerCarIdx)?.classEstLapTime ?? null;
  const trackLength = tick.catalog.track.lengthMeters;

  return relativeOrder(tick.cars, tick.drivers, playerCarIdx, lapEstimate).flatMap((entry) => {
    const row = driverRow(tick, entry.carIdx);
    if (row === null) return [];
    const classPosition = tick.cars.find((car) => car.carIdx === entry.carIdx)?.classPosition ?? 0;
    return [
      {
        ...row,
        gapSeconds: entry.gapSeconds,
        gapMeters: trackLength === null ? null : entry.offset * trackLength,
        lapsAhead: tick.session.isRace ? entry.lapsAhead : 0,
        classPosition: classPosition > 0 ? classPosition : null,
      },
    ];
  });
}

const gapDto = (gap: Gap | null): GapDto | null => (gap === null ? null : { ...gap });

function standingRows(tick: Tick): ClassStandingsDto[] {
  return standings(tick.cars, tick.drivers, tick.session.isRace).map((group) => ({
    classId: group.classId,
    className: group.className,
    classColor: group.classColor,
    strengthOfField: group.strengthOfField,
    rows: group.entries.flatMap((entry) => {
      const row = driverRow(tick, entry.carIdx);
      if (row === null) return [];
      return [
        {
          ...row,
          classPosition: entry.classPosition,
          gap: gapDto(entry.gap),
          interval: gapDto(entry.interval),
          lastLapTime: entry.lastLapTime,
          bestLapTime: entry.bestLapTime,
          hasClassBestLap: entry.hasClassBestLap,
        },
      ];
    }),
  }));
}
