import {
  DISK_SUB_HEADER_OFFSETS,
  DISK_SUB_HEADER_SIZE,
  HEADER_OFFSETS,
  IBT_HEADER_SIZE,
  isVarTypeCode,
  VAR_BUF_COUNT,
  VAR_BUF_OFFSETS,
  VAR_BUF_SIZE,
  VAR_HEADER_OFFSETS,
  VAR_HEADER_SIZE,
  VAR_HEADER_TEXT_LENGTHS,
  VarType,
  type VarTypeCode,
} from './format.js';
import type { DiskSubHeader, IbtHeader, VarBufDescriptor, VarHeader } from './types.js';

const LITTLE_ENDIAN = true;

/** Erro de formato: os bytes não batem com o `.ibt` esperado. */
export class IbtFormatError extends Error {
  override readonly name = 'IbtFormatError';
}

/** Marca o que ainda não foi implementado. Ver `docs/roadmap.md`. */
export class NotImplementedError extends Error {
  override readonly name = 'NotImplementedError';
}

function viewOf(bytes: Uint8Array, minimumLength: number, what: string): DataView {
  if (bytes.byteLength < minimumLength) {
    throw new IbtFormatError(
      `${what}: esperados ao menos ${minimumLength} bytes, recebidos ${bytes.byteLength}`,
    );
  }
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * Lê um campo de texto de tamanho fixo (array de `char` em C), cortando no primeiro NUL.
 *
 * Só para `name`/`description`/`unit`, que são ASCII. A string de session info é
 * CP1252 e tem tratamento próprio — ver `decodeSessionInfo`.
 */
export function readFixedString(view: DataView, offset: number, maxLength: number): string {
  let end = offset;
  const limit = offset + maxLength;
  while (end < limit && view.getUint8(end) !== 0) {
    end += 1;
  }
  let out = '';
  for (let i = offset; i < end; i += 1) {
    out += String.fromCharCode(view.getUint8(i));
  }
  return out;
}

/** Decodifica o header principal (`IBT_HEADER_SIZE` bytes). */
export function decodeHeader(bytes: Uint8Array): IbtHeader {
  const view = viewOf(bytes, IBT_HEADER_SIZE, 'header principal');
  const int = (offset: number): number => view.getInt32(offset, LITTLE_ENDIAN);

  const varBufs: VarBufDescriptor[] = [];
  for (let i = 0; i < VAR_BUF_COUNT; i += 1) {
    const base = HEADER_OFFSETS.varBufs + i * VAR_BUF_SIZE;
    varBufs.push({
      tickCount: int(base + VAR_BUF_OFFSETS.tickCount),
      bufOffset: int(base + VAR_BUF_OFFSETS.bufOffset),
    });
  }

  return {
    version: int(HEADER_OFFSETS.version),
    status: int(HEADER_OFFSETS.status),
    tickRate: int(HEADER_OFFSETS.tickRate),
    sessionInfoUpdate: int(HEADER_OFFSETS.sessionInfoUpdate),
    sessionInfoLength: int(HEADER_OFFSETS.sessionInfoLength),
    sessionInfoOffset: int(HEADER_OFFSETS.sessionInfoOffset),
    numVars: int(HEADER_OFFSETS.numVars),
    varHeaderOffset: int(HEADER_OFFSETS.varHeaderOffset),
    numBuf: int(HEADER_OFFSETS.numBuf),
    bufLen: int(HEADER_OFFSETS.bufLen),
    varBufs,
  };
}

/** Decodifica o disk sub header (`DISK_SUB_HEADER_SIZE` bytes). Só existe em arquivo. */
export function decodeDiskSubHeader(bytes: Uint8Array): DiskSubHeader {
  const view = viewOf(bytes, DISK_SUB_HEADER_SIZE, 'disk sub header');
  return {
    startDate: view.getBigInt64(DISK_SUB_HEADER_OFFSETS.startDate, LITTLE_ENDIAN),
    startTime: view.getFloat64(DISK_SUB_HEADER_OFFSETS.startTime, LITTLE_ENDIAN),
    endTime: view.getFloat64(DISK_SUB_HEADER_OFFSETS.endTime, LITTLE_ENDIAN),
    lapCount: view.getInt32(DISK_SUB_HEADER_OFFSETS.lapCount, LITTLE_ENDIAN),
    recordCount: view.getInt32(DISK_SUB_HEADER_OFFSETS.recordCount, LITTLE_ENDIAN),
  };
}

/** Decodifica uma entrada da tabela de variáveis (`VAR_HEADER_SIZE` bytes). */
export function decodeVarHeader(bytes: Uint8Array): VarHeader {
  const view = viewOf(bytes, VAR_HEADER_SIZE, 'entrada da tabela de variáveis');
  const type = view.getInt32(VAR_HEADER_OFFSETS.type, LITTLE_ENDIAN);
  if (!isVarTypeCode(type)) {
    throw new IbtFormatError(`Tipo de variável desconhecido: ${type}`);
  }
  return {
    type,
    offset: view.getInt32(VAR_HEADER_OFFSETS.offset, LITTLE_ENDIAN),
    count: view.getInt32(VAR_HEADER_OFFSETS.count, LITTLE_ENDIAN),
    countAsTime: view.getUint8(VAR_HEADER_OFFSETS.countAsTime) !== 0,
    name: readFixedString(view, VAR_HEADER_OFFSETS.name, VAR_HEADER_TEXT_LENGTHS.name),
    description: readFixedString(
      view,
      VAR_HEADER_OFFSETS.description,
      VAR_HEADER_TEXT_LENGTHS.description,
    ),
    unit: readFixedString(view, VAR_HEADER_OFFSETS.unit, VAR_HEADER_TEXT_LENGTHS.unit),
  };
}

/**
 * Duração da telemetria em segundos.
 *
 * Ex.: 3371 amostras a 60 Hz ≈ 56 s.
 */
export function durationInSeconds(recordCount: number, tickRate: number): number {
  if (tickRate <= 0) {
    throw new IbtFormatError(`tickRate inválido: ${tickRate}`);
  }
  return recordCount / tickRate;
}

/**
 * Lê um valor de canal de dentro de uma amostra.
 *
 * `bool` e `bitField` viram número de propósito: quem chama sabe o que o canal
 * significa (`OnPitRoad` é 0 ou 1, `SessionFlags` é máscara) e converte. O
 * decoder não adivinha semântica.
 */
export function readChannelValue(view: DataView, byteOffset: number, type: VarTypeCode): number {
  switch (type) {
    case VarType.Char:
      return view.getUint8(byteOffset);
    case VarType.Bool:
      return view.getUint8(byteOffset);
    case VarType.Int:
    case VarType.BitField:
      return view.getInt32(byteOffset, LITTLE_ENDIAN);
    case VarType.Float:
      return view.getFloat32(byteOffset, LITTLE_ENDIAN);
    case VarType.Double:
      return view.getFloat64(byteOffset, LITTLE_ENDIAN);
    default:
      throw new IbtFormatError(`Tipo de variável desconhecido ao ler valor: ${String(type)}`);
  }
}

/** Offset absoluto do valor de um canal dentro do arquivo, para a amostra `index`. */
export function sampleValueOffset(
  bufOffset: number,
  bufLen: number,
  index: number,
  varOffset: number,
): number {
  return bufOffset + index * bufLen + varOffset;
}
