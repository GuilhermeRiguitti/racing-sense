import { describe, expect, it } from 'vitest';
import {
  aGridRegion,
  type GridEntry,
  gridSessionInfo,
  perCarValues,
} from '../../../tests/support/live-grid-scenario.js';
import type { FakeLiveRegion } from '../../../tests/support/live-region.js';
import type { LiveMemoryHandle } from '../ibt/live-memory.js';
import { SESSION_FLAG, TRACK_SURFACE } from '../ibt/sdk-values.js';
import { createLiveTelemetry } from './live-telemetry.js';
import { createOverlayFeed } from './overlay-feed.js';

const entry = (carIdx: number, overrides: Partial<GridEntry> = {}): GridEntry => ({
  carIdx,
  name: `Piloto ${carIdx}`,
  carNumber: String(carIdx + 10),
  carName: 'Ferrari 296 GT3',
  classId: 1,
  className: 'GT3',
  classColor: '0xffda59',
  classEstLapTime: 90,
  iRating: 2000 + carIdx * 100,
  license: 'A 3.45',
  licenseColor: '0x0153db',
  ...overrides,
});

function handleOver(region: FakeLiveRegion): LiveMemoryHandle {
  return { byteLength: region.bytes.byteLength, read: region.memory.read, close() {} };
}

/** Três carros e o pace car; o piloto é o carro 1, no meio. */
function scenario(sessionType = 'Race') {
  const region = aGridRegion();
  region.setSessionInfo(
    gridSessionInfo({
      playerCarIdx: 1,
      sessions: [{ num: 0, type: sessionType }],
      drivers: [
        entry(0, { name: 'Pace Car', isPaceCar: true }),
        entry(1, { name: 'André Teste' }),
        entry(2, { carName: 'Porsche 911 GT3 R (992)' }),
        entry(3),
      ],
    }),
    1,
  );
  const write = (tick: number, overrides: Record<string, number | number[]> = {}) =>
    region.writeFrame(tick % 3, tick, {
      SessionNum: 0,
      SessionTimeRemain: 1200,
      SessionLapsRemainEx: 12,
      Lap: 5,
      LapCompleted: 4,
      FuelLevel: 40,
      LapDeltaToBestLap: -0.25,
      LapDeltaToBestLap_OK: 1,
      LapDeltaToOptimalLap: 0.4,
      LapDeltaToOptimalLap_OK: 0,
      CarIdxLap: perCarValues({ 1: 5, 2: 5, 3: 6 }, 0),
      CarIdxLapCompleted: perCarValues({ 1: 4, 2: 4, 3: 5 }, 0),
      CarIdxLapDistPct: perCarValues({ 0: 0.9, 1: 0.5, 2: 0.52, 3: 0.4 }, -1),
      CarIdxTrackSurface: perCarValues(
        { 0: TRACK_SURFACE.onTrack, 1: TRACK_SURFACE.onTrack, 2: TRACK_SURFACE.onTrack, 3: TRACK_SURFACE.onTrack },
        TRACK_SURFACE.notInWorld,
      ),
      CarIdxEstTime: perCarValues({ 1: 45, 2: 46.8, 3: 36 }, 0),
      CarIdxPosition: perCarValues({ 3: 1, 2: 2, 1: 3 }, 0),
      CarIdxClassPosition: perCarValues({ 3: 1, 2: 2, 1: 3 }, 0),
      CarIdxF2Time: perCarValues({ 3: 0, 2: 81, 1: 83 }, 0),
      ...overrides,
    });
  return { region, write };
}

describe('quadro do overlay', () => {
  it('sim fechado passa adiante como estado', () => {
    const feed = createOverlayFeed(createLiveTelemetry(() => null));

    expect(feed.frame('relative')).toEqual({ state: 'sim-closed' });
  });

  it('relative na ordem da pista, sem o pace car, com quem está uma volta à frente', () => {
    const { region, write } = scenario();
    write(10);
    const feed = createOverlayFeed(createLiveTelemetry(() => handleOver(region)));

    const frame = feed.frame('relative');
    if (frame.state !== 'connected') throw new Error(frame.state);

    expect(frame.relative?.map((row) => row.carIdx)).toEqual([2, 1, 3]);
    const [ahead, player, behind] = frame.relative ?? [];
    expect(player?.isPlayer).toBe(true);
    expect(ahead?.gapSeconds).toBeCloseTo(1.8);
    expect(ahead?.gapMeters).toBeCloseTo(0.02 * 4057, 0);
    expect(ahead?.carMake).toBe('POR');
    expect(behind?.lapsAhead).toBe(1);
    expect(behind?.license).toEqual({ letter: 'A', safetyRating: 3.45, color: '#0153db' });
    expect(frame.standings).toBeNull();
  });

  it('classificação da corrida com gap do sim e SOF', () => {
    const { region, write } = scenario();
    write(10);
    const feed = createOverlayFeed(createLiveTelemetry(() => handleOver(region)));

    const frame = feed.frame('standings');
    if (frame.state !== 'connected') throw new Error(frame.state);

    const [gt3] = frame.standings ?? [];
    expect(gt3?.rows.map((row) => row.carIdx)).toEqual([3, 2, 1]);
    expect(gt3?.rows[1]?.gap).toEqual({ kind: 'time', seconds: 81 });
    expect(gt3?.rows[2]?.interval).toEqual({ kind: 'time', seconds: 2 });
    expect(gt3?.strengthOfField).toBeGreaterThan(2000);
    expect(frame.session.multiMake).toBe(true);
    expect(frame.session.multiClass).toBe(false);
  });

  it('o piloto: delta do sim só quando ele diz que vale, sessão e bandeiras', () => {
    const { region, write } = scenario();
    write(10, { SessionFlags: SESSION_FLAG.blue | SESSION_FLAG.startGo });
    const feed = createOverlayFeed(createLiveTelemetry(() => handleOver(region)));

    const frame = feed.frame('delta');
    if (frame.state !== 'connected') throw new Error(frame.state);

    expect(frame.player?.delta.best).toBeCloseTo(-0.25);
    expect(frame.player?.delta.optimal).toBeNull();
    expect(frame.player?.flags).toEqual(['blue']);
    expect(frame.session.isRace).toBe(true);
    expect(frame.session.lapsRemaining).toBe(12);
    expect(frame.session.timeRemainingSeconds).toBe(1200);
  });

  it('mede o combustível entre cruzamentos da linha', () => {
    const { region, write } = scenario();
    const feed = createOverlayFeed(createLiveTelemetry(() => handleOver(region)));
    write(10, { LapCompleted: 4, FuelLevel: 40 });
    feed.frame('fuel');
    write(11, { LapCompleted: 5, FuelLevel: 37.5 });
    feed.frame('fuel');
    write(12, { LapCompleted: 6, FuelLevel: 35 });

    const frame = feed.frame('fuel');
    if (frame.state !== 'connected') throw new Error(frame.state);

    expect(frame.player?.fuel?.averageUsage).toBeCloseTo(2.5);
    expect(frame.player?.fuel?.fuelToFinish).toBeCloseTo(0);
    expect(frame.player?.fuel?.capacityLiters).toBe(104);
  });

  it('mesmo tick, mesma leitura: várias janelas não multiplicam o trabalho', () => {
    const { region, write } = scenario();
    write(10);
    const feed = createOverlayFeed(createLiveTelemetry(() => handleOver(region)));

    const first = feed.frame('relative');
    const second = feed.frame('radar');
    if (first.state !== 'connected' || second.state !== 'connected') throw new Error('desconectado');

    expect(second.relative).toBe(first.relative);
  });
});
