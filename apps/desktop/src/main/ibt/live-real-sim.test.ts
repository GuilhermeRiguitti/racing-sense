import { afterAll, describe, expect, it } from 'vitest';
import { VAR_TYPE_SIZES } from './format.js';
import {
  freezeLatestFrame,
  isConnected,
  readLiveHeader,
  readLiveSessionInfoText,
  readLiveValue,
  readLiveVariables,
} from './live.js';
import { openLiveMemory } from './live-memory.js';

/**
 * A memória compartilhada do sim de verdade.
 *
 * Só roda com o iRacing aberto numa sessão; com o sim fechado, pula — como o
 * teste de `.ibt` real pula sem fixture. É ele que sustenta o layout ao vivo
 * (docs/formato-ibt.md): as contas do arquivo, adaptadas ao padding que a
 * memória tem e o arquivo não.
 */
const memory = openLiveMemory();
const header = memory === null ? null : readLiveHeader(memory);
const simInSession = header !== null && isConnected(header);
afterAll(() => memory?.close());

describe.skipIf(!simInSession)('memória compartilhada do sim aberto', () => {
  // O corpo do `describe` roda na coleta mesmo quando ele é pulado: com o sim
  // fechado, `memory` é nulo, e ler aqui derrubaria o arquivo inteiro em vez
  // de pular. Por isso a leitura fica atrás de funções, chamadas só nos testes.
  const live = () => memory!;
  const liveHeader = () => header!;
  const variables = () => readLiveVariables(live(), liveHeader());

  it('os canais não se sobrepõem, e o último fecha o tamanho da amostra', () => {
    // Ao vivo, Σ tamanho × count NÃO fecha o bufLen, como fecha no `.ibt`: a
    // memória tem padding entre canais (32 bytes depois de cada array
    // `CarIdx*`, medido em 2026-09-26). O que tem de valer é cada canal no seu
    // lugar, sem invadir o vizinho, e o último terminando no fim da amostra.
    const byOffset = [...variables()].sort((a, b) => a.offset - b.offset);
    let end = 0;
    for (const variable of byOffset) {
      expect(variable.offset, `${variable.name} invade o canal anterior`).toBeGreaterThanOrEqual(
        end,
      );
      end = variable.offset + VAR_TYPE_SIZES[variable.type] * variable.count;
    }
    expect(end).toBe(liveHeader().bufLen);
  });

  it('os buffers em uso cabem na região mapeada', () => {
    const { numBuf, varBufs, bufLen } = liveHeader();
    expect(numBuf).toBeGreaterThanOrEqual(1);
    expect(numBuf).toBeLessThanOrEqual(varBufs.length);
    for (const buffer of varBufs.slice(0, numBuf)) {
      expect(buffer.bufOffset + bufLen).toBeLessThanOrEqual(live().byteLength);
    }
  });

  it('LapDistPct fica em [0, 1]', () => {
    const lapDistPct = variables().find((variable) => variable.name === 'LapDistPct');
    const frame = freezeLatestFrame(live());
    expect(lapDistPct).toBeDefined();
    expect(frame).not.toBeNull();
    const value = readLiveValue(frame!, lapDistPct!) as number;
    // -1 é o que o sim escreve quando o carro não está na pista.
    expect(value === -1 || (value >= 0 && value <= 1)).toBe(true);
  });

  it('a session info decodifica e diz quem é o carro do piloto', () => {
    const text = readLiveSessionInfoText(live(), liveHeader());
    expect(text).toContain('WeekendInfo:');
    expect(text).toMatch(/DriverCarIdx: \d+/);
  });

  it('os canais que o overlay lê existem com esses nomes', () => {
    // Nomes do SDK que `live/overlay-feed.ts` usa (ADR 0025). Canal com nome
    // errado não quebra o overlay — a coluna fica vazia —, então é aqui que o
    // erro aparece, com o nome.
    const wanted = [
      'CarIdxLap',
      'CarIdxLapCompleted',
      'CarIdxLapDistPct',
      'CarIdxTrackSurface',
      'CarIdxOnPitRoad',
      'CarIdxPosition',
      'CarIdxClassPosition',
      'CarIdxEstTime',
      'CarIdxF2Time',
      'CarIdxLastLapTime',
      'CarIdxBestLapTime',
      'SessionNum',
      'SessionTimeRemain',
      'SessionLapsRemainEx',
      'SessionFlags',
      'LapCompleted',
      'FuelLevel',
      'OnPitRoad',
      'CarLeftRight',
      'LapCurrentLapTime',
      'LapLastLapTime',
      'LapBestLapTime',
      'LapDeltaToBestLap',
      'LapDeltaToOptimalLap',
      'LapDeltaToSessionBestLap',
      'LapDeltaToSessionOptimalLap',
      'LapDeltaToSessionLastlLap',
      'PlayerCarMyIncidentCount',
      'Throttle',
      'Brake',
      'Clutch',
    ];
    const names = new Set(variables().map((variable) => variable.name));

    expect(wanted.filter((name) => !names.has(name))).toEqual([]);
  });
});
