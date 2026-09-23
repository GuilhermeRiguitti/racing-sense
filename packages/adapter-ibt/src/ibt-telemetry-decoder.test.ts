import type { TelemetryFilePort, TelemetryFileRef } from '@telemetry/application-desktop';
import {
  DISK_SUB_HEADER_OFFSETS,
  DISK_SUB_HEADER_SIZE,
  HEADER_OFFSETS,
  IBT_HEADER_SIZE,
  VAR_HEADER_OFFSETS,
  VAR_HEADER_SIZE,
  VarType,
} from '@telemetry/ibt-core';
import { describe, expect, it } from 'vitest';
import { readTechnicalMetadata } from './ibt-telemetry-decoder.js';

const LE = true;

/** Monta um `.ibt` sintético: header, disk sub header e dois canais. */
function synthenticIbt(): Uint8Array {
  const varHeaderOffset = IBT_HEADER_SIZE + DISK_SUB_HEADER_SIZE;
  const bytes = new Uint8Array(varHeaderOffset + 2 * VAR_HEADER_SIZE);
  const view = new DataView(bytes.buffer);

  view.setInt32(HEADER_OFFSETS.version, 2, LE);
  view.setInt32(HEADER_OFFSETS.tickRate, 60, LE);
  view.setInt32(HEADER_OFFSETS.numVars, 2, LE);
  view.setInt32(HEADER_OFFSETS.varHeaderOffset, varHeaderOffset, LE);
  view.setInt32(HEADER_OFFSETS.numBuf, 1, LE);
  view.setInt32(HEADER_OFFSETS.bufLen, 8, LE);

  view.setInt32(IBT_HEADER_SIZE + DISK_SUB_HEADER_OFFSETS.lapCount, 3, LE);
  view.setInt32(IBT_HEADER_SIZE + DISK_SUB_HEADER_OFFSETS.recordCount, 3371, LE);

  const writeText = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  const writeVar = (
    index: number,
    type: number,
    count: number,
    name: string,
    unit: string,
  ): void => {
    const base = varHeaderOffset + index * VAR_HEADER_SIZE;
    view.setInt32(base + VAR_HEADER_OFFSETS.type, type, LE);
    view.setInt32(base + VAR_HEADER_OFFSETS.offset, index * 4, LE);
    view.setInt32(base + VAR_HEADER_OFFSETS.count, count, LE);
    writeText(base + VAR_HEADER_OFFSETS.name, name);
    writeText(base + VAR_HEADER_OFFSETS.description, `descrição de ${name}`);
    writeText(base + VAR_HEADER_OFFSETS.unit, unit);
  };

  writeVar(0, VarType.Float, 1, 'Speed', 'm/s');
  writeVar(1, VarType.Int, 64, 'CarIdxLap', '');

  return bytes;
}

function filePortOver(bytes: Uint8Array): TelemetryFilePort {
  const ref: TelemetryFileRef = { locator: 'memória', sizeBytes: bytes.byteLength };
  return {
    async open() {
      return ref;
    },
    async read(_ref, offset, length) {
      if (offset + length > bytes.byteLength) {
        throw new RangeError('leitura fora dos limites');
      }
      return bytes.subarray(offset, offset + length);
    },
    async close() {
      // nada a fechar em memória
    },
  };
}

describe('readTechnicalMetadata', () => {
  const files = filePortOver(synthenticIbt());
  const ref: TelemetryFileRef = { locator: 'memória', sizeBytes: synthenticIbt().byteLength };

  it('lê o header e o disk sub header', async () => {
    const metadata = await readTechnicalMetadata(files, ref);

    expect(metadata.header.tickRate).toBe(60);
    expect(metadata.header.numVars).toBe(2);
    expect(metadata.diskSubHeader.recordCount).toBe(3371);
  });

  it('monta o catálogo de canais em runtime, sem lista fixa', async () => {
    const metadata = await readTechnicalMetadata(files, ref);

    expect(metadata.channels).toHaveLength(2);
    expect(metadata.channels[0]).toMatchObject({
      name: 'Speed',
      unit: 'm/s',
      type: 'number',
      valuesPerSample: 1,
    });
  });

  it('preserva canal indexado por carro com mais de um valor por amostra', async () => {
    const metadata = await readTechnicalMetadata(files, ref);

    expect(metadata.channels[1]).toMatchObject({ name: 'CarIdxLap', valuesPerSample: 64 });
  });

  it('não vaza tipo do formato binário para o domínio', async () => {
    const metadata = await readTechnicalMetadata(files, ref);

    // `type` aqui é o vocabulário do domínio, não o código numérico do irsdk.
    for (const channel of metadata.channels) {
      expect(['number', 'integer', 'boolean', 'text', 'bitfield']).toContain(channel.type);
    }
  });
});
