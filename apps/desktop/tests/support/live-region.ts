import {
  HEADER_OFFSETS,
  IBT_HEADER_SIZE,
  STATUS_CONNECTED,
  VAR_BUF_OFFSETS,
  VAR_BUF_SIZE,
  VAR_HEADER_OFFSETS,
  VAR_HEADER_SIZE,
  VAR_TYPE_SIZES,
  VarType,
  type VarTypeCode,
} from '../../src/main/ibt/format.js';
import type { LiveMemory } from '../../src/main/ibt/live.js';

/**
 * Uma memória compartilhada sintética, para teste.
 *
 * Montada com as constantes de `format.ts`: prova consistência interna, não o
 * layout do sim — esse só a memória de verdade prova (docs/pendencias.md).
 */
export interface FakeVariable {
  readonly name: string;
  readonly type: VarTypeCode;
  readonly count?: number;
}

export interface FakeLiveRegion {
  readonly bytes: Uint8Array;
  readonly memory: LiveMemory;
  /** Grava um frame no buffer `index`, com o `tickCount` dado. */
  writeFrame(index: number, tickCount: number, values: Record<string, number | number[]>): void;
  setStatus(status: number): void;
  setSessionInfo(text: string, update: number): void;
}

const LE = true;
const DEFAULT_SESSION_INFO_SPACE = 1024;

export function aLiveRegion(
  variables: readonly FakeVariable[] = [
    { name: 'Speed', type: VarType.Float },
    { name: 'Gear', type: VarType.Int },
    { name: 'CarIdxLapDistPct', type: VarType.Float, count: 3 },
  ],
  numBuf = 3,
  sessionInfoSpace = DEFAULT_SESSION_INFO_SPACE,
): FakeLiveRegion {
  const offsets = new Map<string, { offset: number; variable: FakeVariable }>();
  let bufLen = 0;
  for (const variable of variables) {
    offsets.set(variable.name, { offset: bufLen, variable });
    bufLen += VAR_TYPE_SIZES[variable.type] * (variable.count ?? 1);
  }

  const varHeaderOffset = IBT_HEADER_SIZE;
  const sessionInfoOffset = varHeaderOffset + variables.length * VAR_HEADER_SIZE;
  const firstBuf = sessionInfoOffset + sessionInfoSpace;
  const bytes = new Uint8Array(firstBuf + numBuf * bufLen);
  const view = new DataView(bytes.buffer);

  view.setInt32(HEADER_OFFSETS.version, 2, LE);
  view.setInt32(HEADER_OFFSETS.status, STATUS_CONNECTED, LE);
  view.setInt32(HEADER_OFFSETS.tickRate, 60, LE);
  view.setInt32(HEADER_OFFSETS.sessionInfoLength, sessionInfoSpace, LE);
  view.setInt32(HEADER_OFFSETS.sessionInfoOffset, sessionInfoOffset, LE);
  view.setInt32(HEADER_OFFSETS.numVars, variables.length, LE);
  view.setInt32(HEADER_OFFSETS.varHeaderOffset, varHeaderOffset, LE);
  view.setInt32(HEADER_OFFSETS.numBuf, numBuf, LE);
  view.setInt32(HEADER_OFFSETS.bufLen, bufLen, LE);
  for (let index = 0; index < numBuf; index += 1) {
    const base = HEADER_OFFSETS.varBufs + index * VAR_BUF_SIZE;
    view.setInt32(base + VAR_BUF_OFFSETS.bufOffset, firstBuf + index * bufLen, LE);
  }

  variables.forEach((variable, index) => {
    const base = varHeaderOffset + index * VAR_HEADER_SIZE;
    view.setInt32(base + VAR_HEADER_OFFSETS.type, variable.type, LE);
    view.setInt32(base + VAR_HEADER_OFFSETS.offset, offsets.get(variable.name)?.offset ?? 0, LE);
    view.setInt32(base + VAR_HEADER_OFFSETS.count, variable.count ?? 1, LE);
    for (let char = 0; char < variable.name.length; char += 1) {
      view.setUint8(base + VAR_HEADER_OFFSETS.name + char, variable.name.charCodeAt(char));
    }
  });

  const writeValue = (at: number, type: VarTypeCode, value: number) => {
    switch (type) {
      case VarType.Float:
        view.setFloat32(at, value, LE);
        break;
      case VarType.Double:
        view.setFloat64(at, value, LE);
        break;
      case VarType.Int:
      case VarType.BitField:
        view.setInt32(at, value, LE);
        break;
      default:
        view.setUint8(at, value);
    }
  };

  return {
    bytes,
    memory: {
      read(offset, length) {
        if (offset < 0 || offset + length > bytes.byteLength) {
          throw new RangeError(`fora da região: ${length} bytes em ${offset}`);
        }
        return bytes.slice(offset, offset + length);
      },
    },
    writeFrame(index, tickCount, values) {
      const base = HEADER_OFFSETS.varBufs + index * VAR_BUF_SIZE;
      view.setInt32(base + VAR_BUF_OFFSETS.tickCount, tickCount, LE);
      const start = firstBuf + index * bufLen;
      for (const [name, value] of Object.entries(values)) {
        const entry = offsets.get(name);
        if (entry === undefined) throw new Error(`canal sintético inexistente: ${name}`);
        const step = VAR_TYPE_SIZES[entry.variable.type];
        const list = Array.isArray(value) ? value : [value];
        list.forEach((item, i) =>
          writeValue(start + entry.offset + i * step, entry.variable.type, item),
        );
      }
    },
    setStatus(status) {
      view.setInt32(HEADER_OFFSETS.status, status, LE);
    },
    setSessionInfo(text, update) {
      // CP1252: um byte por caractere, como o sim grava. Sobra da versão
      // anterior fica depois do NUL, também como no sim.
      for (let char = 0; char < text.length; char += 1) {
        view.setUint8(sessionInfoOffset + char, text.charCodeAt(char));
      }
      view.setUint8(sessionInfoOffset + text.length, 0);
      view.setInt32(HEADER_OFFSETS.sessionInfoUpdate, update, LE);
    },
  };
}
