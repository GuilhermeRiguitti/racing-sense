import { describe, expect, it } from 'vitest';
import type { ChannelDto, LapDto, SeriesDto, StintLapDto } from '../../shared/dto.js';
import {
  adjustmentReadings,
  adjustmentTimeline,
  dynamicsReading,
  fuelReading,
  perLap,
  tireReadings,
} from './engineer.js';

const s = (channel: string, y: readonly number[], type: SeriesDto['type'] = 'number'): SeriesDto => ({
  channel,
  unit: '',
  type,
  axis: 'lapDistPct',
  x: y.map((_, i) => i / Math.max(1, y.length - 1)),
  y,
});

const volta = (overrides: Partial<LapDto> = {}): LapDto => ({
  number: 4,
  startSample: 0,
  endSample: 10,
  lapTimeSeconds: 100,
  isComplete: true,
  flags: [],
  offTrackStretches: [],
  incidents: 0,
  ...overrides,
});

const canal = (name: string, description = name): ChannelDto => ({
  name,
  description,
  unit: '',
  type: 'number',
  valuesPerSample: 1,
});

describe('tireReadings', () => {
  const series = [
    s('LFtempL', [70, 72]), // lado de fora do pneu esquerdo
    s('LFtempM', [75, 77]),
    s('LFtempR', [80, 82]), // lado de dentro
    s('RFtempL', [90, 90]), // lado de dentro do pneu direito
    s('RFtempM', [85, 85]),
    s('RFtempR', [80, 80]), // lado de fora
    s('LFpressure', [150, 160]),
  ];

  it('rotula externa e interna pelo lado do carro, na ordem vista de cima', () => {
    const [esquerdo, direito] = tireReadings(series, null);

    expect(esquerdo?.bands.map((b) => b.position)).toEqual(['ext', 'meio', 'int']);
    expect(direito?.bands.map((b) => b.position)).toEqual(['int', 'meio', 'ext']);
  });

  it('diz a diferença entre interna e externa, sem julgar', () => {
    const [esquerdo, direito] = tireReadings(series, null);

    expect(esquerdo?.innerMinusOuter).toBe(10);
    expect(direito?.innerMinusOuter).toBe(10);
    expect(esquerdo?.middleMinusEdges).toBe(0);
    expect(direito?.middleMinusEdges).toBe(0);
  });

  it('usa a média da volta, ou o valor no cursor quando ele existe', () => {
    expect(tireReadings(series, null)[0]?.pressureKpa).toBe(155);
    expect(tireReadings(series, 1)[0]?.pressureKpa).toBe(160);
  });

  it('roda sem canal de temperatura não inventa leitura', () => {
    const traseira = tireReadings(series, null)[2];

    expect(traseira?.source).toBeNull();
    expect(traseira?.bands.every((b) => b.celsius === null)).toBe(true);
  });

  it('sem superfície, lê a carcaça e diz que é carcaça', () => {
    const [esquerdo] = tireReadings([s('LFtempCM', [90])], null);

    expect(esquerdo?.source).toBe('carcass');
    expect(esquerdo?.bands[1]?.celsius).toBe(90);
  });
});

describe('fuelReading', () => {
  it('consumo é o nível no começo menos no fim, e a projeção é divisão', () => {
    const leitura = fuelReading([s('FuelLevel', [30, 29, 27.5])], volta());

    expect(leitura?.usedLiters).toBe(2.5);
    expect(leitura?.remainingLiters).toBe(27.5);
    expect(leitura?.lapsRemaining).toBe(11);
  });

  it('volta cortada pela gravação não tem consumo de volta', () => {
    const leitura = fuelReading([s('FuelLevel', [30, 29])], volta({ isComplete: false }));

    expect(leitura?.usedLiters).toBeNull();
    expect(leitura?.lapsRemaining).toBeNull();
  });

  it('nível que sobe é abastecimento, não consumo negativo', () => {
    const leitura = fuelReading([s('FuelLevel', [5, 60])], volta());

    expect(leitura?.refueled).toBe(true);
    expect(leitura?.usedLiters).toBeNull();
  });
});

describe('ajustes de dentro do carro', () => {
  const catalogo = [canal('dcBrakeBias', 'In car brake bias'), canal('Speed')];

  it('lê cada ajuste que o carro tem e diz se mexeu na volta', () => {
    const leituras = adjustmentReadings([s('dcBrakeBias', [54, 54, 53.5])], catalogo);

    expect(leituras).toEqual([
      expect.objectContaining({ label: 'In car brake bias', first: 54, last: 53.5, changed: true }),
    ]);
  });

  it('marca na linha do tempo a mudança na volta e a mudança entre voltas', () => {
    const resumo = (first: number, last: number) => ({
      channel: 'dcBrakeBias',
      unit: '',
      type: 'number' as const,
      first,
      last,
      min: Math.min(first, last),
      max: Math.max(first, last),
      mean: (first + last) / 2,
    });
    const stint: StintLapDto[] = [
      { lap: volta({ number: 2 }), channels: [resumo(54, 54)] },
      { lap: volta({ number: 3 }), channels: [resumo(54, 53.5)] },
      { lap: volta({ number: 4 }), channels: [resumo(55, 55)] },
    ];

    expect(adjustmentTimeline(stint, catalogo)).toEqual([
      expect.objectContaining({ lapNumber: 3, from: 54, to: 53.5, when: 'during-lap' }),
      expect.objectContaining({ lapNumber: 4, from: 53.5, to: 55, when: 'between-laps' }),
    ]);
  });
});

describe('dynamicsReading', () => {
  it('pico lateral para qualquer lado e frenagem em g', () => {
    const leitura = dynamicsReading([
      s('LatAccel', [-19.6133, 9.80665]),
      s('LongAccel', [-14.709975, 4]),
      s('BrakeABSactive', [0, 1, 0, 0], 'boolean'),
    ]);

    expect(leitura.peakLateralG).toBeCloseTo(2);
    expect(leitura.peakBrakingG).toBeCloseTo(1.5);
    expect(leitura.absActivePct).toBe(25);
    expect(leitura.maxWaterC).toBeNull();
  });
});

describe('perLap', () => {
  it('um valor por volta, com buraco onde o canal não existe', () => {
    const stint: StintLapDto[] = [
      { lap: volta({ number: 1 }), channels: [] },
      {
        lap: volta({ number: 2 }),
        channels: [
          {
            channel: 'FuelLevel',
            unit: 'l',
            type: 'number',
            first: 30,
            last: 27,
            min: 27,
            max: 30,
            mean: 28.5,
          },
        ],
      },
    ];

    expect(perLap(stint, 'FuelLevel', 'last')).toEqual([null, 27]);
  });
});
