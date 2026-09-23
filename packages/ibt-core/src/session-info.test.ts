import { describe, expect, it } from 'vitest';
import { parseSessionInfo, readNumber, readPath } from './session-info.js';

/** Recorte fiel de um arquivo real de Road Atlanta, com as armadilhas dentro. */
const REAL = `---
WeekendInfo:
 TrackName: roadatlanta full
 TrackLength: 4.0569 km
 TrackDisplayName: Road Atlanta
 TrackConfigName: Full Course
 TrackAirTemp: 30.00 C
 WeekendOptions:
  TimeOfDay: 5:50 pm
  Date: 2026-08-29
  RelativeHumidity: 45 %
SessionInfo:
 CurrentSessionNum: 0
 Sessions:
 - SessionNum: 0
   SessionType: Practice
   SessionSubType: 
   ResultsPositions:
   - Position: 1
     CarIdx: 3
     FastestTime: 70.6628
   - Position: 2
     CarIdx: 9
     FastestTime: 71.1000
 - SessionNum: 1
   SessionType: Race
DriverInfo:
 DriverCarIdx: 9
 Drivers:
 - CarIdx: 0
   UserName: Donald Olson
   CarNumber: "413"
   CarPath: porsche963gtp
   CarScreenName: Porsche 963 GTP
 - CarIdx: 9
   UserName: André Guimarães
   CarNumber: "27"
   CarPath: ferrari296gt3
   CarScreenName: Ferrari 296 GT3
`;

describe('parseSessionInfo', () => {
  const doc = parseSessionInfo(REAL);

  it('lê os blocos de topo', () => {
    expect(Object.keys(doc)).toEqual(['WeekendInfo', 'SessionInfo', 'DriverInfo']);
  });

  it('lê valor com dois-pontos sem aspas — a linha que quebra YAML estrito', () => {
    // `TimeOfDay: 5:50 pm` é o motivo de não usarmos uma lib de YAML.
    expect(readPath(doc, 'WeekendInfo', 'WeekendOptions', 'TimeOfDay')).toBe('5:50 pm');
  });

  it('mantém unidade junto do valor, sem converter cedo', () => {
    expect(readPath(doc, 'WeekendInfo', 'TrackLength')).toBe('4.0569 km');
    expect(readNumber(readPath(doc, 'WeekendInfo', 'TrackLength'))).toBeCloseTo(4.0569);
    expect(readNumber(readPath(doc, 'WeekendInfo', 'TrackAirTemp'))).toBe(30);
  });

  it('lê lista na mesma indentação da chave, como o iRacing escreve', () => {
    const sessions = (doc.SessionInfo as Record<string, unknown>).Sessions;

    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions).toHaveLength(2);
    expect(readPath((sessions as never[])[0], 'SessionType')).toBe('Practice');
    expect(readPath((sessions as never[])[1], 'SessionType')).toBe('Race');
  });

  it('lê lista dentro de item de lista', () => {
    const sessions = (doc.SessionInfo as Record<string, unknown>).Sessions as never[];
    const posicoes = (sessions[0] as unknown as Record<string, unknown>)
      .ResultsPositions as never[];

    expect(posicoes).toHaveLength(2);
    expect(readPath(posicoes[1], 'CarIdx')).toBe('9');
  });

  it('tira as aspas de quem tem, e mantém o resto', () => {
    const drivers = (doc.DriverInfo as Record<string, unknown>).Drivers as never[];

    expect(readPath(drivers[0], 'CarNumber')).toBe('413');
    expect(readPath(drivers[0], 'UserName')).toBe('Donald Olson');
  });

  it('preserva acento — é o teste de que o CP1252 não foi lido como UTF-8', () => {
    const drivers = (doc.DriverInfo as Record<string, unknown>).Drivers as never[];

    expect(readPath(drivers[1], 'UserName')).toBe('André Guimarães');
  });

  it('chave sem valor vira string vazia, não some', () => {
    const sessions = (doc.SessionInfo as Record<string, unknown>).Sessions as never[];

    expect(readPath(sessions[0], 'SessionSubType')).toBe('');
  });

  it('caminho inexistente devolve undefined em vez de explodir', () => {
    expect(readPath(doc, 'WeekendInfo', 'NãoExiste', 'Nada')).toBeUndefined();
    expect(readNumber(undefined)).toBeNull();
  });
});
