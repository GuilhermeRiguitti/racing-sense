import { type FileHandle, open } from 'node:fs/promises';
import type { ByteSource } from '@telemetry/ibt-core';

/**
 * `ByteSource` sobre um arquivo `.ibt` em disco.
 *
 * Lê sob demanda, sem carregar o arquivo inteiro: uma stint de 30 min a 60 Hz
 * passa de 100 mil amostras por canal, e nada disso precisa estar em memória
 * ao mesmo tempo.
 */
export class FileByteSource implements ByteSource {
  private constructor(
    private readonly handle: FileHandle,
    readonly byteLength: number,
  ) {}

  static async open(path: string): Promise<FileByteSource> {
    const handle = await open(path, 'r');
    try {
      const stats = await handle.stat();
      return new FileByteSource(handle, stats.size);
    } catch (error) {
      await handle.close();
      throw error;
    }
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    const end = offset + length;
    if (offset < 0 || end > this.byteLength) {
      throw new RangeError(
        `Leitura fora dos limites: pedidos ${length} bytes em ${offset}, arquivo tem ${this.byteLength}`,
      );
    }
    const target = new Uint8Array(length);
    const { bytesRead } = await this.handle.read(target, 0, length, offset);
    if (bytesRead !== length) {
      // Leitura curta silenciosa vira amostra corrompida lá na frente. Falhe aqui.
      throw new Error(`Leitura curta: esperados ${length} bytes, lidos ${bytesRead}`);
    }
    return target;
  }

  async close(): Promise<void> {
    await this.handle.close();
  }
}
