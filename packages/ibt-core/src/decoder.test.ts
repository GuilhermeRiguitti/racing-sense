import { describe, expect, it } from 'vitest';
import {
  decodeDiskSubHeader,
  decodeHeader,
  decodeVarHeader,
  durationInSeconds,
  IbtFormatError,
  sampleValueOffset,
} from './decoder.js';
import {
  DISK_SUB_HEADER_OFFSETS,
  DISK_SUB_HEADER_SIZE,
  HEADER_OFFSETS,
  IBT_HEADER_SIZE,
  VAR_BUF_COUNT,
  VAR_BUF_SIZE,
  VAR_HEADER_OFFSETS,
  VAR_HEADER_SIZE,
  VAR_HEADER_TEXT_LENGTHS,
  VAR_TYPE_SIZES,
  VarType,
} from './format.js';

const LE = true;

/**
 * Estes testes checam a **consistência interna** do layout declarado e o
 * round-trip dos decoders. Eles não provam que o layout bate com o `.ibt` real —
 * isso só um arquivo de verdade prova (ver docs/pendencias.md, pendência #1).
 */
describe('layout do formato', () => {
  it('o header principal termina exatamente após os descritores de buffer', () => {
    expect(HEADER_OFFSETS.varBufs + VAR_BUF_COUNT * VAR_BUF_SIZE).toBe(IBT_HEADER_SIZE);
  });

  it('a entrada da tabela de variáveis termina exatamente após a unidade', () => {
    expect(VAR_HEADER_OFFSETS.name + VAR_HEADER_TEXT_LENGTHS.name).toBe(
      VAR_HEADER_OFFSETS.description,
    );
    expect(VAR_HEADER_OFFSETS.description + VAR_HEADER_TEXT_LENGTHS.description).toBe(
      VAR_HEADER_OFFSETS.unit,
    );
    expect(VAR_HEADER_OFFSETS.unit + VAR_HEADER_TEXT_LENGTHS.unit).toBe(VAR_HEADER_SIZE);
  });

  it('o disk sub header termina exatamente após recordCount', () => {
    expect(DISK_SUB_HEADER_OFFSETS.recordCount + 4).toBe(DISK_SUB_HEADER_SIZE);
  });

  it('todo tipo de variável tem tamanho declarado', () => {
    for (const code of Object.values(VarType)) {
      expect(VAR_TYPE_SIZES[code]).toBeGreaterThan(0);
    }
  });
});

describe('decodeHeader', () => {
  it('lê os campos e os descritores de buffer', () => {
    const bytes = new Uint8Array(IBT_HEADER_SIZE);
    const view = new DataView(bytes.buffer);
    view.setInt32(HEADER_OFFSETS.version, 2, LE);
    view.setInt32(HEADER_OFFSETS.tickRate, 60, LE);
    view.setInt32(HEADER_OFFSETS.sessionInfoLength, 4096, LE);
    view.setInt32(HEADER_OFFSETS.sessionInfoOffset, 144, LE);
    view.setInt32(HEADER_OFFSETS.numVars, 275, LE);
    view.setInt32(HEADER_OFFSETS.varHeaderOffset, 4240, LE);
    view.setInt32(HEADER_OFFSETS.numBuf, 1, LE);
    view.setInt32(HEADER_OFFSETS.bufLen, 1120, LE);
    view.setInt32(HEADER_OFFSETS.varBufs + 4, 43840, LE);

    const header = decodeHeader(bytes);

    expect(header.version).toBe(2);
    expect(header.tickRate).toBe(60);
    expect(header.numVars).toBe(275);
    expect(header.bufLen).toBe(1120);
    expect(header.varBufs).toHaveLength(VAR_BUF_COUNT);
    expect(header.varBufs[0]?.bufOffset).toBe(43840);
  });

  it('recusa buffer curto em vez de ler lixo', () => {
    expect(() => decodeHeader(new Uint8Array(IBT_HEADER_SIZE - 1))).toThrow(IbtFormatError);
  });
});

describe('decodeDiskSubHeader', () => {
  it('lê datas, contagem de voltas e de amostras', () => {
    const bytes = new Uint8Array(DISK_SUB_HEADER_SIZE);
    const view = new DataView(bytes.buffer);
    view.setBigInt64(DISK_SUB_HEADER_OFFSETS.startDate, 1_758_000_000n, LE);
    view.setFloat64(DISK_SUB_HEADER_OFFSETS.startTime, 12.5, LE);
    view.setFloat64(DISK_SUB_HEADER_OFFSETS.endTime, 68.68, LE);
    view.setInt32(DISK_SUB_HEADER_OFFSETS.lapCount, 3, LE);
    view.setInt32(DISK_SUB_HEADER_OFFSETS.recordCount, 3371, LE);

    const disk = decodeDiskSubHeader(bytes);

    expect(disk.startDate).toBe(1_758_000_000n);
    expect(disk.startTime).toBeCloseTo(12.5);
    expect(disk.lapCount).toBe(3);
    expect(disk.recordCount).toBe(3371);
  });
});

describe('decodeVarHeader', () => {
  it('lê tipo, offset e os campos de texto cortando no NUL', () => {
    const bytes = new Uint8Array(VAR_HEADER_SIZE);
    const view = new DataView(bytes.buffer);
    view.setInt32(VAR_HEADER_OFFSETS.type, VarType.Float, LE);
    view.setInt32(VAR_HEADER_OFFSETS.offset, 40, LE);
    view.setInt32(VAR_HEADER_OFFSETS.count, 1, LE);
    const write = (offset: number, text: string): void => {
      for (let i = 0; i < text.length; i += 1) {
        view.setUint8(offset + i, text.charCodeAt(i));
      }
    };
    write(VAR_HEADER_OFFSETS.name, 'Speed');
    write(VAR_HEADER_OFFSETS.description, 'GPS vehicle speed');
    write(VAR_HEADER_OFFSETS.unit, 'm/s');

    const header = decodeVarHeader(bytes);

    expect(header).toMatchObject({
      type: VarType.Float,
      offset: 40,
      count: 1,
      countAsTime: false,
      name: 'Speed',
      description: 'GPS vehicle speed',
      unit: 'm/s',
    });
  });

  it('rejeita código de tipo desconhecido', () => {
    const bytes = new Uint8Array(VAR_HEADER_SIZE);
    new DataView(bytes.buffer).setInt32(VAR_HEADER_OFFSETS.type, 99, LE);
    expect(() => decodeVarHeader(bytes)).toThrow(IbtFormatError);
  });
});

describe('cálculos derivados', () => {
  it('duração é recordCount / tickRate', () => {
    expect(durationInSeconds(3371, 60)).toBeCloseTo(56.18, 2);
  });

  it('tickRate inválido não vira Infinity silencioso', () => {
    expect(() => durationInSeconds(3371, 0)).toThrow(IbtFormatError);
  });

  it('offset de valor combina base do buffer, índice da amostra e offset do canal', () => {
    expect(sampleValueOffset(43840, 1120, 100, 40)).toBe(43840 + 100 * 1120 + 40);
  });
});
