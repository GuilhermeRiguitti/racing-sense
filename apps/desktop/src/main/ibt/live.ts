import { decodeHeader, decodeVarHeader, IbtFormatError, readChannelValue } from './decoder.js';
import {
  HEADER_OFFSETS,
  IBT_HEADER_SIZE,
  LIVE_FRAME_COPY_ATTEMPTS,
  STATUS_CONNECTED,
  VAR_BUF_OFFSETS,
  VAR_BUF_SIZE,
  VAR_HEADER_SIZE,
  VAR_TYPE_SIZES,
} from './format.js';
import { decodeSessionInfoText } from './session-info.js';
import type { IbtHeader, VarBufDescriptor, VarHeader } from './types.js';

/**
 * A memória compartilhada do sim, lida por cópia.
 *
 * Síncrona de propósito: a região está mapeada no processo, ler é copiar bytes,
 * e a verificação do frame congelado (`freezeLatestFrame`) só vale se nada roda
 * entre copiar o buffer e reler o `tickCount`.
 *
 * A implementação sobre o Windows é `openLiveMemory`, em `live-memory.ts`. Aqui
 * não há I/O: o decoder recebe a região, como recebe a `ByteSource` do arquivo.
 */
export interface LiveMemory {
  /**
   * Copia exatamente `length` bytes a partir de `offset`. Pedido fora da região
   * falha — nunca devolve menos (regra 24).
   */
  read(offset: number, length: number): Uint8Array;
}

/** Um instante do sim: uma amostra inteira (`bufLen` bytes), copiada de uma vez. */
export interface LiveFrame {
  readonly tickCount: number;
  readonly bytes: Uint8Array;
}

/** Valor de um canal num frame: escalar, ou um valor por carro em `CarIdx*`. */
export type LiveValue = number | readonly number[];

export function readLiveHeader(memory: LiveMemory): IbtHeader {
  return decodeHeader(memory.read(0, IBT_HEADER_SIZE));
}

/** O sim está rodando uma sessão e escrevendo amostras. */
export function isConnected(header: IbtHeader): boolean {
  return (header.status & STATUS_CONNECTED) !== 0;
}

/**
 * A tabela de variáveis ao vivo: a mesma do `.ibt`, no mesmo lugar do header.
 * O catálogo vem dela em runtime, nunca de lista fixa (regra 13).
 */
export function readLiveVariables(memory: LiveMemory, header: IbtHeader): VarHeader[] {
  const table = memory.read(header.varHeaderOffset, header.numVars * VAR_HEADER_SIZE);
  const variables: VarHeader[] = [];
  for (let index = 0; index < header.numVars; index += 1) {
    const start = index * VAR_HEADER_SIZE;
    variables.push(decodeVarHeader(table.subarray(start, start + VAR_HEADER_SIZE)));
  }
  return variables;
}

/**
 * O YAML de session info ao vivo, já em texto (CP1252, regra 14).
 *
 * Ao vivo, `sessionInfoLength` é o tamanho do **espaço reservado**, não do texto:
 * o sim reescreve a string no mesmo lugar e termina com NUL. O que vem depois do
 * primeiro NUL é sobra de uma versão anterior, maior — e parseá-la juntaria duas
 * session infos numa.
 */
export function readLiveSessionInfoText(memory: LiveMemory, header: IbtHeader): string {
  const bytes = memory.read(header.sessionInfoOffset, header.sessionInfoLength);
  const end = bytes.indexOf(0);
  return decodeSessionInfoText(end === -1 ? bytes : bytes.subarray(0, end));
}

/**
 * O descritor do buffer mais recente entre os `numBuf` em uso.
 *
 * Ao vivo o sim alterna a escrita entre os buffers; o de maior `tickCount` é o
 * último que ele terminou.
 */
export function latestVarBuf(header: IbtHeader): VarBufDescriptor {
  const inUse = header.varBufs.slice(0, header.numBuf);
  const latest = inUse.reduce<VarBufDescriptor | undefined>(
    (best, candidate) => (best === undefined || candidate.tickCount > best.tickCount ? candidate : best),
    undefined,
  );
  if (latest === undefined) {
    throw new IbtFormatError(`numBuf inválido na memória compartilhada: ${header.numBuf}`);
  }
  return latest;
}

/**
 * Copia o frame mais recente sem misturar ticks.
 *
 * O sim continua escrevendo enquanto copiamos. A defesa é a do SDK oficial:
 * anota o `tickCount` do buffer, copia, relê o `tickCount`. Se mudou, o buffer
 * foi reescrito no meio da cópia e os bytes misturam dois instantes — descarta e
 * tenta de novo. Sem isso o erro não aparece como erro, aparece como ruído.
 *
 * Devolve `null` quando nenhuma tentativa pegou um frame inteiro; o próximo tick
 * resolve.
 */
export function freezeLatestFrame(memory: LiveMemory): LiveFrame | null {
  for (let attempt = 0; attempt < LIVE_FRAME_COPY_ATTEMPTS; attempt += 1) {
    const header = readLiveHeader(memory);
    const index = header.varBufs.indexOf(latestVarBuf(header));
    const { tickCount, bufOffset } = header.varBufs[index] as VarBufDescriptor;

    const bytes = memory.read(bufOffset, header.bufLen);

    const tickOffset = HEADER_OFFSETS.varBufs + index * VAR_BUF_SIZE + VAR_BUF_OFFSETS.tickCount;
    const tick = memory.read(tickOffset, 4);
    const after = new DataView(tick.buffer, tick.byteOffset, tick.byteLength).getInt32(0, true);
    if (after === tickCount) {
      return { tickCount, bytes };
    }
  }
  return null;
}

/**
 * Todos os frames mais novos que `sinceTick`, do mais antigo ao mais novo.
 *
 * O sim guarda os últimos `numBuf` ticks (3, medido): quem pergunta a cada
 * ~33 ms recebe todos, sem buraco, e o pedal desenhado é o que o piloto fez em
 * cada tick — não uma amostra a cada tantos. Quem pergunta mais devagar perde os
 * que o sim já reescreveu, e o `tickCount` mostra onde.
 *
 * Cada buffer é copiado e conferido como em `freezeLatestFrame`: se o sim o
 * reescreveu no meio da cópia, ele fica de fora — o tick seguinte chega na
 * próxima pergunta. Com `sinceTick` nulo, só o mais recente.
 */
export function freshFrames(memory: LiveMemory, sinceTick: number | null): LiveFrame[] {
  if (sinceTick === null) {
    const latest = freezeLatestFrame(memory);
    return latest === null ? [] : [latest];
  }

  const header = readLiveHeader(memory);
  const pending = header.varBufs
    .slice(0, header.numBuf)
    .map((buffer, index) => ({ ...buffer, index }))
    .filter((buffer) => buffer.tickCount > sinceTick)
    .sort((a, b) => a.tickCount - b.tickCount);

  const frames: LiveFrame[] = [];
  for (const { tickCount, bufOffset, index } of pending) {
    const bytes = memory.read(bufOffset, header.bufLen);
    const tickOffset = HEADER_OFFSETS.varBufs + index * VAR_BUF_SIZE + VAR_BUF_OFFSETS.tickCount;
    const tick = memory.read(tickOffset, 4);
    const after = new DataView(tick.buffer, tick.byteOffset, tick.byteLength).getInt32(0, true);
    if (after === tickCount) frames.push({ tickCount, bytes });
  }
  return frames;
}

/**
 * O valor de um canal num frame.
 *
 * Canal com `count > 1` é indexado por carro (`CarIdxLapDistPct`): vem inteiro,
 * um valor por carro, na ordem do `CarIdx`.
 */
export function readLiveValue(frame: LiveFrame, variable: VarHeader): LiveValue {
  const view = new DataView(frame.bytes.buffer, frame.bytes.byteOffset, frame.bytes.byteLength);
  if (variable.count === 1) {
    return readChannelValue(view, variable.offset, variable.type);
  }
  const step = VAR_TYPE_SIZES[variable.type];
  const values: number[] = [];
  for (let index = 0; index < variable.count; index += 1) {
    values.push(readChannelValue(view, variable.offset + index * step, variable.type));
  }
  return values;
}
