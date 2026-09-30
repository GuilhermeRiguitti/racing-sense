import { describe, expect, it } from 'vitest';
import { parseSessionInfo } from './session-info.js';
import {
  toCarLimits,
  toCarSetup,
  toGridDrivers,
  toSectorStarts,
  toSessionTypes,
} from './session-mapping.js';

/**
 * Recorte no formato do bloco `CarSetup` de um GT3. A ficha de verdade muda por
 * carro — o teste confere a forma da árvore, não quais seções existem.
 */
const COM_ACERTO = `---
DriverInfo:
 DriverCarIdx: 0
 DriverCarRedLine: 7500.000
 DriverCarSLShiftRPM: 7250.000
 DriverCarFuelMaxLtr: 104.000
 Drivers:
 - CarIdx: 0
   UserName: André Guimarães
CarSetup:
 UpdateCount: 3
 TiresAero:
  LeftFront:
   StartingPressure: 152.0 kPa
   LastHotPressure: 168.9 kPa
   LastTempsOMI: 71C, 68C, 65C
 Chassis:
  Front:
   ArbBlades: 3
   BrakePressureBias: 54.2%
`;

describe('toCarSetup', () => {
  it('devolve a ficha como árvore, com os valores como o sim escreveu', () => {
    const setup = toCarSetup(parseSessionInfo(COM_ACERTO));

    expect(setup?.map((secao) => secao.key)).toEqual(['TiresAero', 'Chassis']);
    const dianteiro = setup?.[0]?.children[0];
    expect(dianteiro?.key).toBe('LeftFront');
    expect(dianteiro?.children).toContainEqual({
      key: 'LastTempsOMI',
      value: '71C, 68C, 65C',
      children: [],
    });
  });

  it('deixa de fora a contabilidade do sim', () => {
    const setup = toCarSetup(parseSessionInfo(COM_ACERTO));

    expect(setup?.some((secao) => secao.key === 'UpdateCount')).toBe(false);
  });

  it('arquivo sem acerto devolve null, não ficha vazia', () => {
    expect(toCarSetup(parseSessionInfo('WeekendInfo:\n TrackName: suzuka\n'))).toBeNull();
  });
});

describe('toCarLimits', () => {
  it('lê corte, troca de marcha e tanque do DriverInfo', () => {
    expect(toCarLimits(parseSessionInfo(COM_ACERTO))).toEqual({
      redlineRpm: 7500,
      shiftRpm: 7250,
      fuelCapacityLiters: 104,
    });
  });

  it('campo ausente é null, não zero', () => {
    expect(toCarLimits(parseSessionInfo('DriverInfo:\n DriverCarIdx: 0\n')).shiftRpm).toBeNull();
  });
});

/** O bloco como veio de um `.ibt` real de Road Atlanta (2026-09-24). */
const COM_SETORES = `---
SplitTimeInfo:
 Sectors:
 - SectorNum: 0
   SectorStartPct: 0.000000
 - SectorNum: 1
   SectorStartPct: 0.167875
 - SectorNum: 2
   SectorStartPct: 0.442307
 - SectorNum: 3
   SectorStartPct: 0.787105
`;

describe('toSectorStarts', () => {
  it('lê onde cada setor começa, na ordem da volta', () => {
    expect(toSectorStarts(parseSessionInfo(COM_SETORES))).toEqual([
      0, 0.167875, 0.442307, 0.787105,
    ]);
  });

  it('ordena pelo número do setor, não pela ordem do texto', () => {
    const fora = `---
SplitTimeInfo:
 Sectors:
 - SectorNum: 1
   SectorStartPct: 0.500000
 - SectorNum: 0
   SectorStartPct: 0.000000
`;
    expect(toSectorStarts(parseSessionInfo(fora))).toEqual([0, 0.5]);
  });

  it('arquivo sem o bloco devolve null, não setores inventados', () => {
    expect(toSectorStarts(parseSessionInfo('WeekendInfo:\n TrackName: suzuka\n'))).toBeNull();
  });

  it('setores fora de forma devolvem null', () => {
    const semLinha = `---
SplitTimeInfo:
 Sectors:
 - SectorNum: 0
   SectorStartPct: 0.100000
`;
    expect(toSectorStarts(parseSessionInfo(semLinha))).toBeNull();
  });
});

/** Recorte no formato do `DriverInfo` e do `SessionInfo` de um treino multiclasse. */
const GRID = `---
WeekendInfo:
 TrackName: roadatlanta full
SessionInfo:
 Sessions:
 - SessionNum: 0
   SessionType: Practice
 - SessionNum: 1
   SessionType: Race
DriverInfo:
 DriverCarIdx: 1
 Drivers:
 - CarIdx: 0
   UserName: Pace Car
   CarNumber: "0"
   CarScreenName: safety pcporsche911cup
   CarIsPaceCar: 1
   IsSpectator: 0
   IRating: 0
   LicString: R 0.01
 - CarIdx: 1
   UserName: André Guimarães
   CarNumber: "413"
   CarScreenName: Ferrari 296 GT3
   CarScreenNameShort: Ferrari 296 GT3
   CarClassID: 4083
   CarClassShortName: GT3 Class
   CarClassColor: 0xffda59
   CarClassEstLapTime: 78.1234
   IRating: 2345
   LicString: A 3.45
   LicColor: 0x0153db
   TeamName: 3:16 Racing
   CarIsPaceCar: 0
   IsSpectator: 0
 - CarIdx: 2
   UserName: Outro Piloto
   CarNumber: "7"
   CarScreenName: Porsche 718 Cayman GT4 Clubsport MR
   CarClassID: 4088
   CarClassShortName:
   CarScreenNameShort: Porsche 718 GT4
   CarClassColor: 0x33ceff
   IRating: 1500
   LicString: C 2.10
   LicColor: 0xfeec04
   CarIsPaceCar: 0
   IsSpectator: 1
`;

describe('toGridDrivers', () => {
  const drivers = toGridDrivers(parseSessionInfo(GRID));

  it('lê cada carro com carteira, iRating, classe e fabricante', () => {
    expect(drivers[1]).toEqual({
      carIdx: 1,
      name: 'André Guimarães',
      carNumber: '413',
      car: { name: 'Ferrari 296 GT3', make: { id: 'ferrari', name: 'Ferrari', short: 'FER' } },
      classId: 4083,
      className: 'GT3 Class',
      classColor: '#ffda59',
      classEstLapTime: 78.1234,
      iRating: 2345,
      license: { letter: 'A', safetyRating: 3.45, color: '#0153db' },
      teamName: '3:16 Racing',
      isPaceCar: false,
      isSpectator: false,
    });
  });

  it('marca pace car e espectador; iRating zero é desconhecido', () => {
    expect(drivers[0]?.isPaceCar).toBe(true);
    expect(drivers[0]?.iRating).toBeNull();
    expect(drivers[2]?.isSpectator).toBe(true);
  });

  it('classe sem nome curto usa o nome curto do carro', () => {
    expect(drivers[2]?.className).toBe('Porsche 718 GT4');
  });
});

describe('toSessionTypes', () => {
  it('acha a sessão pelo número que o canal SessionNum dá', () => {
    const doc = parseSessionInfo(GRID);
    expect(toSessionTypes(doc).get(1)).toBe('Race');
    expect(toSessionTypes(doc).get(9)).toBeUndefined();
  });
});
