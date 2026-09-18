import { type FileHandle, open } from 'node:fs/promises';
import type { TelemetryFilePort, TelemetryFileRef } from '@telemetry/application-desktop';

/**
 * Porta de arquivo sobre o disco local.
 *
 * Lê sob demanda, sem carregar o arquivo inteiro: uma stint de 30 min a 60 Hz
 * passa de 100 mil amostras por canal.
 *
 * É o único lugar do sistema que abre arquivo. Trocar disco por upload, S3 ou
 * memória compartilhada (fase 2) é escrever outro adapter para esta mesma porta.
 */
export function createFileTelemetrySource(): TelemetryFilePort {
  const handles = new Map<string, FileHandle>();

  return {
    async open(locator: string): Promise<TelemetryFileRef> {
      const handle = await open(locator, 'r');
      try {
        const stats = await handle.stat();
        handles.set(locator, handle);
        return { locator, sizeBytes: stats.size };
      } catch (error) {
        await handle.close();
        throw error;
      }
    },

    async read(ref: TelemetryFileRef, offset: number, length: number): Promise<Uint8Array> {
      const handle = handles.get(ref.locator);
      if (handle === undefined) {
        throw new Error(`Arquivo não está aberto: ${ref.locator}`);
      }
      if (offset < 0 || offset + length > ref.sizeBytes) {
        throw new RangeError(
          `Leitura fora dos limites: ${length} bytes em ${offset}, arquivo tem ${ref.sizeBytes}`,
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

    async close(ref: TelemetryFileRef): Promise<void> {
      const handle = handles.get(ref.locator);
      if (handle !== undefined) {
        handles.delete(ref.locator);
        await handle.close();
      }
    },
  };
}
