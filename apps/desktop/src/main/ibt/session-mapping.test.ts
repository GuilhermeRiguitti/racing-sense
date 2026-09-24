import { describe, expect, it } from 'vitest';
import { parseSessionInfo } from './session-info.js';
import { toCarLimits, toCarSetup } from './session-mapping.js';

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
