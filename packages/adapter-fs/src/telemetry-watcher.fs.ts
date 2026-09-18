import type { TelemetryWatcherPort } from '@telemetry/application-desktop';
import { NotImplementedError } from '@telemetry/domain';

/**
 * Watcher da pasta de telemetria do iRacing.
 *
 * Caminho típico: `%USERPROFILE%\Documents\iRacing\telemetry\`. Um arquivo novo
 * nasce a cada vez que o piloto entra no carro com a telemetria armada (`Alt-L`).
 *
 * ## O problema que este adapter existe para resolver
 *
 * Enquanto a sessão roda, o sim mantém o arquivo aberto e o Windows o trava. Um
 * `open()` ingênuo no evento de criação pega arquivo incompleto ou toma `EBUSY`.
 * Estratégia (ADR 0004):
 *
 * 1. na criação, só registrar o candidato — não ler nada;
 * 2. esperar o tamanho ficar estável por N verificações seguidas;
 * 3. tentar abrir; em `EBUSY`/`EPERM`, backoff e nova tentativa;
 * 4. validar o header antes de avisar que está pronto;
 * 5. arquivo que nunca estabiliza vence por timeout e vai para `onFileRejected` —
 *    nunca some em silêncio.
 *
 * Nada disso é decodificação: é só sobre *quando* o arquivo pode ser lido.
 */
export interface FileWatcherOptions {
  readonly directory: string;
  readonly stableChecks?: number;
  readonly pollIntervalMs?: number;
  readonly timeoutMs?: number;
}

export function createFileTelemetryWatcher(_options: FileWatcherOptions): TelemetryWatcherPort {
  throw new NotImplementedError(
    'Watcher de pasta ainda não implementado; a estratégia contra o file-lock está documentada aqui e no ADR 0004',
  );
}
