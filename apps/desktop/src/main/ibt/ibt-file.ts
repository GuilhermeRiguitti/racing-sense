import { type FileHandle, open } from 'node:fs/promises';
import type { ByteSource } from './byte-source.js';
import {
  type DecodedMetadata,
  readChannel,
  readMetadata,
  readTechnicalMetadata,
  type TechnicalMetadata,
} from './ibt-telemetry-decoder.js';

/**
 * Um `.ibt` aberto no disco.
 *
 * Lê sob demanda, sem carregar o arquivo inteiro: uma stint de 30 min a 60 Hz
 * passa de 100 mil amostras por canal.
 *
 * É a forma que a ingestão consome. O ao vivo não passa por aqui: ele só
 * visualiza, e o que vira sessão é o `.ibt` (ADR 0023).
 */
export interface IbtFile {
  readonly path: string;
  readonly sizeBytes: number;
  readMetadata(): Promise<DecodedMetadata>;
  readTechnicalMetadata(): Promise<TechnicalMetadata>;
  readChannel(channel: string): AsyncIterable<number>;
  /** Pode ser chamado mais de uma vez: um `close` repetido num `finally` não falha. */
  close(): Promise<void>;
}

/** Abre para leitura. Leitura curta é erro, nunca buffer parcial (regra 23). */
export async function openIbtFile(path: string): Promise<IbtFile> {
  const handle = await open(path, 'r');
  let sizeBytes: number;
  try {
    sizeBytes = (await handle.stat()).size;
  } catch (error) {
    await handle.close();
    throw error;
  }

  let closed = false;
  const source = fileByteSource(handle, path, sizeBytes, () => closed);

  return {
    path,
    sizeBytes,
    readMetadata: () => readMetadata(source),
    readTechnicalMetadata: () => readTechnicalMetadata(source),
    readChannel: (channel) => readChannel(source, channel),
    async close() {
      if (closed) return;
      closed = true;
      await handle.close();
    },
  };
}

function fileByteSource(
  handle: FileHandle,
  path: string,
  sizeBytes: number,
  isClosed: () => boolean,
): ByteSource {
  return {
    byteLength: sizeBytes,
    async read(offset, length) {
      if (isClosed()) {
        throw new Error(`Arquivo já fechado: ${path}`);
      }
      if (offset < 0 || offset + length > sizeBytes) {
        throw new RangeError(
          `Leitura fora dos limites: ${length} bytes em ${offset}, arquivo tem ${sizeBytes}`,
        );
      }

      const target = new Uint8Array(length);
      const { bytesRead } = await handle.read(target, 0, length, offset);
      if (bytesRead !== length) {
        // Leitura curta silenciosa vira amostra corrompida longe da causa.
        throw new Error(`Leitura curta: esperados ${length} bytes, lidos ${bytesRead}`);
      }
      return target;
    },
  };
}
