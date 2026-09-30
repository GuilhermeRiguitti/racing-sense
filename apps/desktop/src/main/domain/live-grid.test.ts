import { describe, expect, it } from 'vitest';
import type { GridDriver } from './driver.js';
import { toCarModel } from './driver.js';
import {
  type CarState,
  relativeOrder,
  standings,
  strengthOfField,
  trackOffset,
} from './live-grid.js';

function aDriver(carIdx: number, overrides: Partial<GridDriver> = {}): GridDriver {
  return {
    carIdx,
    name: `Piloto ${carIdx}`,
    carNumber: String(carIdx),
    car: toCarModel('Ferrari 296 GT3'),
    classId: 1,
    className: 'GT3',
    classColor: '#ffda59',
    classEstLapTime: 100,
    iRating: 2000,
    license: null,
    teamName: null,
    isPaceCar: false,
    isSpectator: false,
    ...overrides,
  };
}

function aCar(carIdx: number, overrides: Partial<CarState> = {}): CarState {
  return {
    carIdx,
    lap: 5,
    lapsCompleted: 4,
    lapDistPct: 0.5,
    presence: 'on-track',
    onPitRoad: false,
    position: 0,
    classPosition: 0,
    estTime: 50,
    f2Time: 0,
    lastLapTime: null,
    bestLapTime: null,
    ...overrides,
  };
}

const grid = (...drivers: GridDriver[]) => new Map(drivers.map((d) => [d.carIdx, d]));

describe('posição na pista', () => {
  it('o caminho mais curto no círculo', () => {
    expect(trackOffset(0.6, 0.5)).toBeCloseTo(0.1);
    expect(trackOffset(0.05, 0.95)).toBeCloseTo(0.1);
    expect(trackOffset(0.95, 0.05)).toBeCloseTo(-0.1);
  });
});

describe('relative', () => {
  it('ordena do mais à frente ao mais atrás, com o piloto no meio', () => {
    const cars = [
      aCar(0, { lapDistPct: 0.4, estTime: 40 }),
      aCar(1, { lapDistPct: 0.5, estTime: 50 }),
      aCar(2, { lapDistPct: 0.55, estTime: 55 }),
    ];

    const order = relativeOrder(cars, grid(aDriver(0), aDriver(1), aDriver(2)), 1, 100);

    expect(order.map((e) => e.carIdx)).toEqual([2, 1, 0]);
    expect(order[0]?.gapSeconds).toBeCloseTo(5);
    expect(order[2]?.gapSeconds).toBeCloseTo(-10);
  });

  it('o gap atravessa a linha de chegada com a volta estimada', () => {
    // O carro já cruzou a linha (est 2 s), o piloto está no fim da volta (est 97 s).
    const cars = [
      aCar(0, { lapDistPct: 0.02, estTime: 2, lapsCompleted: 5, lap: 6 }),
      aCar(1, { lapDistPct: 0.97, estTime: 97 }),
    ];

    const [ahead] = relativeOrder(cars, grid(aDriver(0), aDriver(1)), 1, 100);

    expect(ahead?.carIdx).toBe(0);
    expect(ahead?.gapSeconds).toBeCloseTo(5);
    expect(ahead?.lapsAhead).toBe(0);
  });

  it('diz quem está uma volta à frente e quem vai tomar volta', () => {
    const cars = [
      aCar(0, { lapDistPct: 0.6, lapsCompleted: 5 }),
      aCar(1, { lapDistPct: 0.5, lapsCompleted: 4 }),
      aCar(2, { lapDistPct: 0.45, lapsCompleted: 3 }),
    ];

    const order = relativeOrder(cars, grid(aDriver(0), aDriver(1), aDriver(2)), 1, 100);

    expect(order.find((e) => e.carIdx === 0)?.lapsAhead).toBe(1);
    expect(order.find((e) => e.carIdx === 2)?.lapsAhead).toBe(-1);
  });

  it('pace car, espectador e carro fora do mundo não entram', () => {
    const cars = [
      aCar(0),
      aCar(1),
      aCar(2, { presence: 'not-in-world', lapDistPct: -1 }),
      aCar(3),
    ];
    const drivers = grid(
      aDriver(0, { isPaceCar: true }),
      aDriver(1),
      aDriver(2),
      aDriver(3, { isSpectator: true }),
    );

    expect(relativeOrder(cars, drivers, 1, 100).map((e) => e.carIdx)).toEqual([1]);
  });

  it('piloto fora do mundo: sem relative', () => {
    const cars = [aCar(0), aCar(1, { presence: 'not-in-world', lapDistPct: -1 })];

    expect(relativeOrder(cars, grid(aDriver(0), aDriver(1)), 1, 100)).toEqual([]);
  });
});

describe('classificação', () => {
  it('na corrida, a ordem e o gap são os do sim', () => {
    const cars = [
      aCar(0, { classPosition: 2, position: 2, f2Time: 3.5 }),
      aCar(1, { classPosition: 1, position: 1, f2Time: 0 }),
      aCar(2, { classPosition: 3, position: 3, f2Time: 4 }),
    ];

    const [gt3] = standings(cars, grid(aDriver(0), aDriver(1), aDriver(2)), true);

    expect(gt3?.entries.map((e) => e.carIdx)).toEqual([1, 0, 2]);
    expect(gt3?.entries[0]?.gap).toBeNull();
    expect(gt3?.entries[1]?.gap).toEqual({ kind: 'time', seconds: 3.5 });
    expect(gt3?.entries[2]?.interval).toEqual({ kind: 'time', seconds: 0.5 });
  });

  it('a uma volta ou mais do líder, o gap é em voltas', () => {
    const cars = [
      aCar(0, { classPosition: 1, lapsCompleted: 10, lapDistPct: 0.3, f2Time: 0 }),
      aCar(1, { classPosition: 2, lapsCompleted: 9, lapDistPct: 0.2, f2Time: 110 }),
    ];

    const [gt3] = standings(cars, grid(aDriver(0), aDriver(1)), true);

    expect(gt3?.entries[1]?.gap).toEqual({ kind: 'laps', laps: 1 });
  });

  it('fora da corrida, a melhor volta decide a ordem e o gap', () => {
    const cars = [
      aCar(0, { bestLapTime: 101.2 }),
      aCar(1, { bestLapTime: 100.5 }),
      aCar(2, { bestLapTime: null }),
    ];

    const [gt3] = standings(cars, grid(aDriver(0), aDriver(1), aDriver(2)), false);

    expect(gt3?.entries.map((e) => e.carIdx)).toEqual([1, 0, 2]);
    expect(gt3?.entries[1]?.gap).toEqual({ kind: 'time', seconds: expect.closeTo(0.7) });
    expect(gt3?.entries[0]?.hasClassBestLap).toBe(true);
    expect(gt3?.entries[2]?.gap).toBeNull();
  });

  it('separa as classes, a mais rápida primeiro', () => {
    const cars = [aCar(0), aCar(1), aCar(2)];
    const drivers = grid(
      aDriver(0, { classId: 2, className: 'GT4', classEstLapTime: 110 }),
      aDriver(1, { classId: 1, className: 'GT3', classEstLapTime: 100 }),
      aDriver(2, { classId: 2, className: 'GT4', classEstLapTime: 110 }),
    );

    const classes = standings(cars, drivers, true);

    expect(classes.map((c) => c.className)).toEqual(['GT3', 'GT4']);
    expect(classes[1]?.entries).toHaveLength(2);
  });
});

describe('strength of field', () => {
  it('grid de iRatings iguais tem o SOF do iRating', () => {
    expect(strengthOfField([2000, 2000, 2000])).toBeCloseTo(2000);
  });

  it('a média exponencial pesa mais os iRatings baixos que a média simples', () => {
    const sof = strengthOfField([1000, 3000]) as number;
    expect(sof).toBeLessThan(2000);
    expect(sof).toBeGreaterThan(1000);
  });

  it('sem iRating conhecido, sem SOF', () => {
    expect(strengthOfField([null, 0])).toBeNull();
  });
});
