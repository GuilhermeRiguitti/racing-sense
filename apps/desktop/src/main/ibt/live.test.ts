import { describe, expect, it } from 'vitest';
import { HEADER_OFFSETS, VAR_BUF_OFFSETS } from './format.js';
import {
  freezeLatestFrame,
  freshFrames,
  isConnected,
  latestVarBuf,
  type LiveMemory,
  readLiveHeader,
  readLiveSessionInfoText,
  readLiveValue,
  readLiveVariables,
} from './live.js';
import { aLiveRegion } from '../../../tests/support/live-region.js';

describe('leitura da memória compartilhada', () => {
  it('lê o catálogo da tabela de variáveis, como no arquivo', () => {
    const region = aLiveRegion();
    const header = readLiveHeader(region.memory);

    const variables = readLiveVariables(region.memory, header);

    expect(variables.map((v) => v.name)).toEqual(['Speed', 'Gear', 'CarIdxLapDistPct']);
    expect(variables[2]?.count).toBe(3);
  });

  it('conectado é o bit do status', () => {
    const region = aLiveRegion();
    expect(isConnected(readLiveHeader(region.memory))).toBe(true);

    region.setStatus(0);
    expect(isConnected(readLiveHeader(region.memory))).toBe(false);
  });

  it('o buffer mais recente é o de maior tickCount, só entre os numBuf em uso', () => {
    const region = aLiveRegion(undefined, 3);
    region.writeFrame(0, 10, {});
    region.writeFrame(1, 12, {});
    region.writeFrame(2, 11, {});

    const header = readLiveHeader(region.memory);

    expect(latestVarBuf(header)).toBe(header.varBufs[1]);
  });

  it('copia o frame mais recente e lê escalar e canal por carro', () => {
    const region = aLiveRegion();
    region.writeFrame(0, 100, { Speed: 50, Gear: 3, CarIdxLapDistPct: [0.1, 0.2, 0.3] });
    region.writeFrame(1, 101, { Speed: 51, Gear: 4, CarIdxLapDistPct: [0.4, 0.5, 0.6] });

    const frame = freezeLatestFrame(region.memory);
    const variables = readLiveVariables(region.memory, readLiveHeader(region.memory));

    expect(frame?.tickCount).toBe(101);
    expect(readLiveValue(frame!, variables[0]!)).toBe(51);
    expect(readLiveValue(frame!, variables[1]!)).toBe(4);
    const perCar = readLiveValue(frame!, variables[2]!) as number[];
    expect(perCar.map((v) => Number(v.toFixed(2)))).toEqual([0.4, 0.5, 0.6]);
  });

  it('descarta a cópia quando o sim reescreve o buffer no meio dela', () => {
    const region = aLiveRegion();
    region.writeFrame(0, 200, { Speed: 10 });
    let rewrites = 1;
    // O sim escreve um tick novo no mesmo buffer logo depois que a cópia do
    // frame começa: a primeira tentativa mistura instantes e tem de ser jogada fora.
    const memory: LiveMemory = {
      read(offset, length) {
        const bytes = region.memory.read(offset, length);
        if (length > 4 && offset !== 0 && rewrites > 0) {
          rewrites -= 1;
          region.writeFrame(0, 201, { Speed: 11 });
        }
        return bytes;
      },
    };

    const frame = freezeLatestFrame(memory);

    expect(frame?.tickCount).toBe(201);
  });

  it('desiste do tick quando nenhuma tentativa pega um frame inteiro', () => {
    const region = aLiveRegion();
    region.writeFrame(0, 300, {});
    let tick = 300;
    const tickOffset = HEADER_OFFSETS.varBufs + VAR_BUF_OFFSETS.tickCount;
    const memory: LiveMemory = {
      read(offset, length) {
        // Toda releitura do tickCount já encontra um tick mais novo.
        if (offset === tickOffset && length === 4) {
          tick += 1;
          region.writeFrame(0, tick, {});
        }
        return region.memory.read(offset, length);
      },
    };

    expect(freezeLatestFrame(memory)).toBeNull();
  });

  it('session info vai até o primeiro NUL: o resto é sobra da versão anterior', () => {
    const region = aLiveRegion();
    region.setSessionInfo('WeekendInfo:\n TrackName: suzuka grandprix\n Sobra: xxxxxxxxxx\n', 1);
    region.setSessionInfo('WeekendInfo:\n TrackName: roadatlanta full\n', 2);

    const text = readLiveSessionInfoText(region.memory, readLiveHeader(region.memory));

    expect(text).toBe('WeekendInfo:\n TrackName: roadatlanta full\n');
  });

  it('session info é CP1252', () => {
    const region = aLiveRegion();
    region.setSessionInfo('DriverInfo:\n UserName: André\n', 1);

    expect(readLiveSessionInfoText(region.memory, readLiveHeader(region.memory))).toContain(
      'André',
    );
  });

  it('numBuf zero é formato inválido, não buffer vazio', () => {
    const region = aLiveRegion();
    new DataView(region.bytes.buffer).setInt32(HEADER_OFFSETS.numBuf, 0, true);

    expect(() => latestVarBuf(readLiveHeader(region.memory))).toThrow(/numBuf/);
  });

  it('entrega todos os ticks mais novos que o último lido, do mais antigo ao mais novo', () => {
    const region = aLiveRegion(undefined, 3);
    region.writeFrame(0, 21, { Speed: 1 });
    region.writeFrame(1, 22, { Speed: 2 });
    region.writeFrame(2, 20, { Speed: 0 });
    const speed = readLiveVariables(region.memory, readLiveHeader(region.memory))[0]!;

    const frames = freshFrames(region.memory, 20);

    expect(frames.map((frame) => frame.tickCount)).toEqual([21, 22]);
    expect(frames.map((frame) => readLiveValue(frame, speed))).toEqual([1, 2]);
  });

  it('sem tick anterior, só o mais recente', () => {
    const region = aLiveRegion(undefined, 3);
    region.writeFrame(0, 21, {});
    region.writeFrame(1, 22, {});

    expect(freshFrames(region.memory, null).map((frame) => frame.tickCount)).toEqual([22]);
  });

  it('buffer reescrito no meio da cópia fica de fora: chega na próxima pergunta', () => {
    const region = aLiveRegion(undefined, 2);
    region.writeFrame(0, 30, {});
    region.writeFrame(1, 31, {});
    let rewrites = 1;
    const memory: LiveMemory = {
      read(offset, length) {
        const bytes = region.memory.read(offset, length);
        if (length > 4 && offset !== 0 && rewrites > 0) {
          rewrites -= 1;
          region.writeFrame(0, 32, {});
        }
        return bytes;
      },
    };

    expect(freshFrames(memory, 29).map((frame) => frame.tickCount)).toEqual([31]);
  });
});
