import koffi from 'koffi';
import { STATUS_CONNECTED } from '../../src/main/ibt/format.js';
import { CAR_LEFT_RIGHT, SESSION_FLAG, TRACK_SURFACE, UNLIMITED_LAPS } from '../../src/main/ibt/sdk-values.js';
import { aGridRegion, type GridEntry, gridSessionInfo, perCarValues } from './live-grid-scenario.js';

/**
 * Um "sim" falso para olhar o overlay e a tela ao vivo sem o iRacing numa
 * sessão: cria um arquivo mapeado com **outro nome** (nunca o do iRacing) e
 * escreve nele, a 60 Hz, um grid sintético andando na pista.
 *
 * É ferramenta de tela, não de prova: os números são inventados, com a forma
 * dos do SDK. O app lê pelo mesmo caminho do sim de verdade, apontado por
 * `TELEMETRY_LIVE_MEMORY_NAME`. Só Windows.
 */
export interface FakeSim {
  stop(): void;
}

const TICK_RATE = 60;
/** A pista anda mais rápido que o relógio, para uma volta caber num print. */
const TIME_SCALE = 3;
const TRACK_KM = 4.0569;

const LICENSE_COLORS: Record<string, string> = {
  R: '0xfc0706',
  D: '0xff8c00',
  C: '0xfeec04',
  B: '0x00c702',
  A: '0x0153db',
  P: '0x000000',
};

const GT3 = { classId: 4083, className: 'GT3', classColor: '0xffda59', classEstLapTime: 88.4 };
const GT4 = { classId: 4088, className: 'GT4', classColor: '0x33ceff', classEstLapTime: 95.1 };

const CARS: readonly [string, string, string, number, string, typeof GT3][] = [
  ['Pace Car', '0', 'safety pcporsche911cup', 0, 'R 0.01', GT3],
  ['Lucas Andrade', '3', 'Ferrari 296 GT3', 3120, 'A 3.87', GT3],
  ['Mika Virtanen', '91', 'Porsche 911 GT3 R (992)', 4410, 'A 4.52', GT3],
  ['Sophie Laurent', '24', 'BMW M4 GT3', 2780, 'B 3.12', GT3],
  ['Tomás Riera', '7', 'Mercedes-AMG GT3 2020', 2950, 'A 2.64', GT3],
  ['André Guimarães', '413', 'Ferrari 296 GT3', 2345, 'A 3.45', GT3],
  ['Kenji Watanabe', '63', 'Lamborghini Huracán GT3 EVO', 2610, 'B 2.98', GT3],
  ['Oliver Grant', '59', 'McLaren 720S GT3 EVO', 2190, 'C 3.71', GT3],
  ['Marta Nowak', '44', 'Audi R8 LMS EVO II GT3', 1980, 'B 4.01', GT3],
  ['Diego Fuentes', '11', 'Aston Martin Vantage GT3 EVO', 1850, 'C 2.45', GT3],
  ['Ethan Brooks', '66', 'Ford Mustang GT3', 1720, 'D 3.33', GT3],
  ['Hanna Berg', '3', 'Chevrolet Corvette Z06 GT3.R', 1640, 'C 1.98', GT3],
  ['Rafael Costa', '86', 'Acura NSX GT3 EVO 22', 1510, 'D 2.20', GT3],
  ['Nina Petrova', '14', 'Lexus RC F GT3', 1420, 'R 2.87', GT3],
  ['Caio Menezes', '401', 'Porsche 718 Cayman GT4 Clubsport MR', 2210, 'B 3.56', GT4],
  ['Jonas Keller', '402', 'BMW M4 GT4', 1990, 'C 3.10', GT4],
  ['Lea Fischer', '403', 'Aston Martin Vantage GT4', 1870, 'C 2.77', GT4],
  ['Pedro Alves', '404', 'McLaren 570S GT4', 1640, 'D 3.95', GT4],
  ['Yuki Tanaka', '405', 'Mercedes-AMG GT4', 1480, 'D 2.31', GT4],
  ['Sam Carter', '406', 'Porsche 718 Cayman GT4 Clubsport MR', 1350, 'R 3.02', GT4],
  ['Iris Moreau', '407', 'BMW M4 GT4', 1210, 'R 2.50', GT4],
  ['Victor Hugo', '408', 'Toyota GR Supra GT4', 1105, 'R 1.75', GT4],
];

const PLAYER = 5;
const IN_PIT = 12;

function createMapping(name: string, size: number) {
  const lib = koffi.load('kernel32.dll');
  const create = lib.func('__stdcall', 'CreateFileMappingW', 'void *', [
    'intptr_t',
    'void *',
    'uint32_t',
    'uint32_t',
    'uint32_t',
    'str16',
  ]);
  const map = lib.func('__stdcall', 'MapViewOfFile', 'void *', ['void *', 'uint32_t', 'uint32_t', 'uint32_t', 'size_t']);
  const unmap = lib.func('__stdcall', 'UnmapViewOfFile', 'bool', ['void *']);
  const close = lib.func('__stdcall', 'CloseHandle', 'bool', ['void *']);
  const INVALID_HANDLE_VALUE = -1;
  const PAGE_READWRITE = 0x04;
  const FILE_MAP_WRITE = 0x02;
  const handle = create(INVALID_HANDLE_VALUE, null, PAGE_READWRITE, 0, size, name);
  if (handle === null) throw new Error(`não foi possível criar o mapeamento ${name}`);
  const view = map(handle, FILE_MAP_WRITE, 0, 0, 0);
  const target = new Uint8Array(koffi.view(view, size));
  return {
    write: (bytes: Uint8Array) => target.set(bytes),
    release() {
      unmap(view);
      close(handle);
    },
  };
}

/** Velocidade do carro do piloto num ponto da volta: retas e curvas inventadas. */
function speedAt(pct: number): number {
  const corners = [0.08, 0.21, 0.33, 0.47, 0.58, 0.71, 0.86];
  const nearest = Math.min(...corners.map((c) => Math.abs(pct - c)));
  return 32 + 38 * Math.min(1, nearest / 0.06);
}

export function startFakeSim(name: string): FakeSim {
  const region = aGridRegion(3);
  const drivers: GridEntry[] = CARS.map(([userName, carNumber, carName, iRating, license, klass], carIdx) => ({
    carIdx,
    name: userName,
    carNumber,
    carName,
    ...klass,
    iRating,
    license,
    licenseColor: LICENSE_COLORS[license[0] as string] ?? '0xffffff',
    isPaceCar: carIdx === 0,
  }));
  region.setSessionInfo(
    gridSessionInfo({ playerCarIdx: PLAYER, sessions: [{ num: 0, type: 'Race' }], drivers }),
    1,
  );
  const mapping = createMapping(name, region.bytes.byteLength);

  // Cada carro começa espalhado pela pista; o grid anda a ritmos um pouco diferentes.
  const count = CARS.length;
  const progress = drivers.map((_, i) => (i === 0 ? 0.95 : 12 - i * 0.045 - (i >= 14 ? 0.9 : 0)));
  const pace = drivers.map((d, i) => d.classEstLapTime * (1 + ((i * 37) % 11) / 400));
  const best = drivers.map(() => null as number | null);
  const last = drivers.map(() => null as number | null);
  const lapStartTime = drivers.map(() => 0);
  let tick = 0;
  let sessionTime = 0;
  let fuel = 62;
  let previousSpeed = speedAt(progress[PLAYER]! % 1);

  const step = () => {
    tick += 1;
    const dt = TIME_SCALE / TICK_RATE;
    sessionTime += dt;

    for (let i = 1; i < count; i += 1) {
      if (i === IN_PIT) continue;
      const before = Math.floor(progress[i]!);
      const pct = progress[i]! % 1;
      const speedFactor = i === PLAYER ? speedAt(pct) / 55 : 1;
      progress[i]! += (dt / pace[i]!) * speedFactor;
      if (Math.floor(progress[i]!) > before) {
        const lapTime = sessionTime - lapStartTime[i]!;
        if (lapStartTime[i]! > 0) {
          last[i] = lapTime;
          best[i] = best[i] === null ? lapTime : Math.min(best[i]!, lapTime);
          if (i === PLAYER) fuel -= 2.7 + Math.sin(sessionTime) * 0.15;
        }
        lapStartTime[i] = sessionTime;
      }
    }

    const order = drivers
      .map((d, i) => ({ i, p: progress[i]!, classId: d.classId }))
      .filter(({ i }) => i !== 0)
      .sort((a, b) => b.p - a.p);
    const position: Record<number, number> = {};
    const classPosition: Record<number, number> = {};
    const f2: Record<number, number> = {};
    const leaderOf: Record<number, number> = {};
    order.forEach(({ i, p, classId }, index) => {
      position[i] = index + 1;
      const inClass = order.filter((o) => o.classId === classId);
      classPosition[i] = inClass.findIndex((o) => o.i === i) + 1;
      leaderOf[classId] ??= inClass[0]!.p;
      f2[i] = (order[0]!.p - p) * drivers[i]!.classEstLapTime;
    });

    const pctOf = (i: number) => progress[i]! % 1;
    const playerPct = pctOf(PLAYER);
    const speed = speedAt(playerPct);
    const accel = (speed - previousSpeed) * TICK_RATE / TIME_SCALE;
    previousSpeed = speed;
    const nearest = drivers
      .map((_, i) => i)
      .filter((i) => i !== PLAYER && i !== 0 && i !== IN_PIT)
      .map((i) => {
        let offset = pctOf(i) - playerPct;
        if (offset > 0.5) offset -= 1;
        if (offset < -0.5) offset += 1;
        return offset * TRACK_KM * 1000;
      })
      .reduce((closest, m) => (Math.abs(m) < Math.abs(closest) ? m : closest), Infinity);

    region.writeFrame(tick % 3, tick, {
      SessionTime: sessionTime,
      SessionTimeRemain: Math.max(0, 2700 - sessionTime),
      SessionNum: 0,
      SessionState: 4,
      SessionFlags:
        SESSION_FLAG.green | (Math.floor(sessionTime / 20) % 3 === 1 ? SESSION_FLAG.blue : 0),
      SessionLapsRemainEx: UNLIMITED_LAPS,
      Speed: speed,
      RPM: 4200 + speed * 55,
      Gear: Math.min(6, Math.max(2, Math.round(speed / 12))),
      Throttle: accel > -2 ? Math.min(1, 0.35 + accel / 12) : 0,
      Brake: accel < -2 ? Math.min(1, -accel / 25) : 0,
      Clutch: 1,
      SteeringWheelAngle: Math.sin(playerPct * 40) * 0.8,
      LatAccel: Math.sin(playerPct * 40) * 14,
      LongAccel: accel,
      Lap: Math.floor(progress[PLAYER]!) + 1,
      LapCompleted: Math.floor(progress[PLAYER]!),
      LapDistPct: playerPct,
      LapCurrentLapTime: sessionTime - lapStartTime[PLAYER]!,
      LapLastLapTime: last[PLAYER] ?? -1,
      LapBestLapTime: best[PLAYER] ?? -1,
      LapDeltaToBestLap: Math.sin(sessionTime / 4) * 0.6,
      LapDeltaToBestLap_OK: 1,
      LapDeltaToOptimalLap: Math.sin(sessionTime / 4) * 0.6 + 0.4,
      LapDeltaToOptimalLap_OK: 1,
      LapDeltaToSessionBestLap: Math.sin(sessionTime / 4) * 0.6 + 0.9,
      LapDeltaToSessionBestLap_OK: 1,
      FuelLevel: fuel,
      OnPitRoad: 0,
      IsOnTrack: 1,
      CarLeftRight: Math.abs(nearest) < 6 ? CAR_LEFT_RIGHT.carLeft : CAR_LEFT_RIGHT.clear,
      PlayerCarMyIncidentCount: 2,
      AirTemp: 24.5,
      TrackTempCrew: 38.2,
      CarIdxLap: perCarValues(Object.fromEntries(drivers.map((_, i) => [i, Math.floor(progress[i]!) + 1])), 0),
      CarIdxLapCompleted: perCarValues(Object.fromEntries(drivers.map((_, i) => [i, Math.floor(progress[i]!)])), 0),
      CarIdxLapDistPct: perCarValues(Object.fromEntries(drivers.map((_, i) => [i, pctOf(i)])), -1),
      CarIdxTrackSurface: perCarValues(
        Object.fromEntries(
          drivers.map((_, i) => [i, i === IN_PIT ? TRACK_SURFACE.inPitStall : TRACK_SURFACE.onTrack]),
        ),
        TRACK_SURFACE.notInWorld,
      ),
      CarIdxOnPitRoad: perCarValues({ [IN_PIT]: 1 }, 0),
      CarIdxPosition: perCarValues(position, 0),
      CarIdxClassPosition: perCarValues(classPosition, 0),
      CarIdxEstTime: perCarValues(
        Object.fromEntries(drivers.map((d, i) => [i, pctOf(i) * d.classEstLapTime])),
        0,
      ),
      CarIdxF2Time: perCarValues(f2, 0),
      CarIdxLastLapTime: perCarValues(Object.fromEntries(last.map((t, i) => [i, t ?? -1])), -1),
      CarIdxBestLapTime: perCarValues(Object.fromEntries(best.map((t, i) => [i, t ?? -1])), -1),
    });
    region.setStatus(STATUS_CONNECTED);
    mapping.write(region.bytes);
  };

  const timer = setInterval(step, 1000 / TICK_RATE);
  return {
    stop() {
      clearInterval(timer);
      mapping.release();
    },
  };
}
