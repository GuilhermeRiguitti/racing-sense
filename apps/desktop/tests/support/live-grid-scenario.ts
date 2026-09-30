import { VarType } from '../../src/main/ibt/format.js';
import { aLiveRegion, type FakeLiveRegion, type FakeVariable } from './live-region.js';

/**
 * Uma sessão com grid, para o overlay: os canais `CarIdx*` e os do carro do
 * piloto com os nomes do SDK, e a session info com `DriverInfo.Drivers`.
 *
 * Como `live-region.ts`, prova consistência interna — o que o sim de verdade
 * entrega só o sim prova (docs/pendencias.md, item 15).
 */
export const CAR_SLOTS = 64;

const scalar = (name: string, type: FakeVariable['type']): FakeVariable => ({ name, type });
const perCar = (name: string, type: FakeVariable['type']): FakeVariable => ({
  name,
  type,
  count: CAR_SLOTS,
});

export const GRID_VARIABLES: readonly FakeVariable[] = [
  scalar('SessionTime', VarType.Double),
  scalar('SessionTimeRemain', VarType.Double),
  scalar('SessionNum', VarType.Int),
  scalar('SessionState', VarType.Int),
  scalar('SessionFlags', VarType.BitField),
  scalar('SessionLapsRemainEx', VarType.Int),
  scalar('Speed', VarType.Float),
  scalar('RPM', VarType.Float),
  scalar('Gear', VarType.Int),
  scalar('Throttle', VarType.Float),
  scalar('Brake', VarType.Float),
  scalar('Clutch', VarType.Float),
  scalar('SteeringWheelAngle', VarType.Float),
  scalar('LatAccel', VarType.Float),
  scalar('LongAccel', VarType.Float),
  scalar('Lap', VarType.Int),
  scalar('LapCompleted', VarType.Int),
  scalar('LapDistPct', VarType.Float),
  scalar('LapCurrentLapTime', VarType.Float),
  scalar('LapLastLapTime', VarType.Float),
  scalar('LapBestLapTime', VarType.Float),
  scalar('LapDeltaToBestLap', VarType.Float),
  scalar('LapDeltaToBestLap_OK', VarType.Bool),
  scalar('LapDeltaToOptimalLap', VarType.Float),
  scalar('LapDeltaToOptimalLap_OK', VarType.Bool),
  scalar('LapDeltaToSessionBestLap', VarType.Float),
  scalar('LapDeltaToSessionBestLap_OK', VarType.Bool),
  scalar('FuelLevel', VarType.Float),
  scalar('OnPitRoad', VarType.Bool),
  scalar('IsOnTrack', VarType.Bool),
  scalar('CarLeftRight', VarType.Int),
  scalar('PlayerCarMyIncidentCount', VarType.Int),
  scalar('AirTemp', VarType.Float),
  scalar('TrackTempCrew', VarType.Float),
  perCar('CarIdxLap', VarType.Int),
  perCar('CarIdxLapCompleted', VarType.Int),
  perCar('CarIdxLapDistPct', VarType.Float),
  perCar('CarIdxTrackSurface', VarType.Int),
  perCar('CarIdxOnPitRoad', VarType.Bool),
  perCar('CarIdxPosition', VarType.Int),
  perCar('CarIdxClassPosition', VarType.Int),
  perCar('CarIdxEstTime', VarType.Float),
  perCar('CarIdxF2Time', VarType.Float),
  perCar('CarIdxLastLapTime', VarType.Float),
  perCar('CarIdxBestLapTime', VarType.Float),
];

export interface GridEntry {
  readonly carIdx: number;
  readonly name: string;
  readonly carNumber: string;
  readonly carName: string;
  readonly classId: number;
  readonly className: string;
  readonly classColor: string;
  readonly classEstLapTime: number;
  readonly iRating: number;
  readonly license: string;
  readonly licenseColor: string;
  readonly isPaceCar?: boolean;
}

export interface GridSessionInfo {
  readonly trackName?: string;
  readonly trackLengthKm?: number;
  readonly playerCarIdx: number;
  readonly sessions?: readonly { readonly num: number; readonly type: string }[];
  readonly drivers: readonly GridEntry[];
}

/** A session info no formato que o sim escreve (mapas indentados, listas com `- `). */
export function gridSessionInfo(info: GridSessionInfo): string {
  const lines = [
    '---',
    'WeekendInfo:',
    ` TrackName: ${info.trackName ?? 'roadatlanta full'}`,
    ' TrackDisplayName: Michelin Raceway Road Atlanta',
    ` TrackLength: ${(info.trackLengthKm ?? 4.0569).toFixed(4)} km`,
    'SessionInfo:',
    ' Sessions:',
    ...(info.sessions ?? [{ num: 0, type: 'Race' }]).flatMap((s) => [
      ` - SessionNum: ${s.num}`,
      `   SessionType: ${s.type}`,
    ]),
    'SplitTimeInfo:',
    ' Sectors:',
    ' - SectorNum: 0',
    '   SectorStartPct: 0.000000',
    ' - SectorNum: 1',
    '   SectorStartPct: 0.330000',
    ' - SectorNum: 2',
    '   SectorStartPct: 0.660000',
    'DriverInfo:',
    ` DriverCarIdx: ${info.playerCarIdx}`,
    ' DriverCarRedLine: 7500.000',
    ' DriverCarSLShiftRPM: 7200.000',
    ' DriverCarFuelMaxLtr: 104.000',
    ' Drivers:',
    ...info.drivers.flatMap((d) => [
      ` - CarIdx: ${d.carIdx}`,
      `   UserName: ${d.name}`,
      `   CarNumber: "${d.carNumber}"`,
      `   CarScreenName: ${d.carName}`,
      `   CarClassID: ${d.classId}`,
      `   CarClassShortName: ${d.className}`,
      `   CarClassColor: ${d.classColor}`,
      `   CarClassEstLapTime: ${d.classEstLapTime.toFixed(4)}`,
      `   IRating: ${d.iRating}`,
      `   LicString: ${d.license}`,
      `   LicColor: ${d.licenseColor}`,
      `   CarIsPaceCar: ${d.isPaceCar === true ? 1 : 0}`,
      '   IsSpectator: 0',
    ]),
    '',
  ];
  return lines.join('\n');
}

/** Uma região com os canais de grid e espaço para a session info de um grid cheio. */
export function aGridRegion(numBuf = 3): FakeLiveRegion {
  return aLiveRegion(GRID_VARIABLES, numBuf, 64 * 1024);
}

/** Um valor por carro, com `fill` nos que não estão em `values`. */
export function perCarValues(values: Readonly<Record<number, number>>, fill: number): number[] {
  return Array.from({ length: CAR_SLOTS }, (_, carIdx) => values[carIdx] ?? fill);
}
