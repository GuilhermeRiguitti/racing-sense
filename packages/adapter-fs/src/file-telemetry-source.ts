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
/** Um arquivo aberto no disco, e cada abertura que o usa. */
interface ArquivoAberto {
  readonly handle: Promise<FileHandle>;
  readonly aberturas: Set<TelemetryFileRef>;
}

export function createFileTelemetrySource(): TelemetryFilePort {
  // Por caminho, um handle só; por abertura, uma identidade própria. Guardar só
  // pelo caminho fazia a segunda abertura do mesmo `.ibt` sobrescrever a
  // primeira — o handle antigo vazava, e o primeiro `close` derrubava a leitura
  // de quem ainda estava lendo.
  const arquivos = new Map<string, ArquivoAberto>();

  const abertoPor = (ref: TelemetryFileRef): ArquivoAberto | undefined => {
    const arquivo = arquivos.get(ref.locator);
    return arquivo?.aberturas.has(ref) ? arquivo : undefined;
  };

  return {
    async open(locator: string): Promise<TelemetryFileRef> {
      let arquivo = arquivos.get(locator);
      if (arquivo === undefined) {
        // A promessa entra no mapa antes de resolver: duas aberturas simultâneas
        // do mesmo caminho esperam o mesmo handle em vez de abrir dois.
        arquivo = { handle: open(locator, 'r'), aberturas: new Set() };
        arquivos.set(locator, arquivo);
      }

      try {
        const stats = await (await arquivo.handle).stat();
        const ref: TelemetryFileRef = { locator, sizeBytes: stats.size };
        arquivo.aberturas.add(ref);
        return ref;
      } catch (error) {
        if (arquivo.aberturas.size === 0) {
          arquivos.delete(locator);
          await arquivo.handle.then((handle) => handle.close()).catch(() => undefined);
        }
        throw error;
      }
    },

    async read(ref: TelemetryFileRef, offset: number, length: number): Promise<Uint8Array> {
      const arquivo = abertoPor(ref);
      if (arquivo === undefined) {
        throw new Error(`Arquivo não está aberto: ${ref.locator}`);
      }
      if (offset < 0 || offset + length > ref.sizeBytes) {
        throw new RangeError(
          `Leitura fora dos limites: ${length} bytes em ${offset}, arquivo tem ${ref.sizeBytes}`,
        );
      }

      const target = new Uint8Array(length);
      const { bytesRead } = await (await arquivo.handle).read(target, 0, length, offset);
      if (bytesRead !== length) {
        // Leitura curta silenciosa vira amostra corrompida longe da causa.
        throw new Error(`Leitura curta: esperados ${length} bytes, lidos ${bytesRead}`);
      }
      return target;
    },

    async close(ref: TelemetryFileRef): Promise<void> {
      const arquivo = abertoPor(ref);
      // Fechar de novo a mesma abertura não faz nada: um `close` repetido num
      // `finally` não pode consumir a abertura de outra parte do sistema.
      if (arquivo === undefined) return;

      arquivo.aberturas.delete(ref);
      if (arquivo.aberturas.size === 0) {
        arquivos.delete(ref.locator);
        await (await arquivo.handle).close();
      }
    },
  };
}
