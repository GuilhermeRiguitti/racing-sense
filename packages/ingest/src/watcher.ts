/**
 * Watcher da pasta de telemetria do iRacing.
 *
 * Caminho típico no Windows: `%USERPROFILE%\Documents\iRacing\telemetry\`.
 * Um arquivo novo nasce a cada vez que o piloto entra no carro com a telemetria
 * armada (`Alt-L` no sim).
 *
 * ## O problema que este módulo existe para resolver
 *
 * Enquanto a sessão roda, o sim mantém o arquivo aberto e o Windows o deixa
 * travado. Um `open()` ingênuo no evento `add` do chokidar pega um arquivo
 * incompleto ou toma `EBUSY`. A estratégia adotada (ver docs/adr/0004):
 *
 * 1. no evento de criação, **não** ler nada — só registrar o candidato;
 * 2. esperar o tamanho do arquivo ficar estável por N verificações consecutivas;
 * 3. tentar abrir para leitura; em `EBUSY`/`EPERM`, aplicar backoff e tentar de novo;
 * 4. só então validar o header e enfileirar para ingestão;
 * 5. arquivo que nunca estabiliza (sim travou, sessão abandonada) vence por timeout
 *    e vai para a fila de quarentena, não some em silêncio.
 *
 * Nada disso é adivinhação de encoding ou de formato: é só sobre quando o arquivo
 * pode ser lido. A decodificação continua em `@telemetry/ibt-core`.
 */

/** Ainda não implementado — ver `docs/roadmap.md`. */
export class NotImplementedError extends Error {
  override readonly name = 'NotImplementedError';
}

export interface WatcherOptions {
  /** Pasta observada. Default: pasta de telemetria do iRacing no usuário atual. */
  directory: string;
  /** Verificações de tamanho estável antes de considerar o arquivo pronto. */
  stableChecks?: number;
  /** Intervalo entre verificações, em ms. */
  pollIntervalMs?: number;
  /** Tempo máximo esperando estabilizar antes de mandar para quarentena, em ms. */
  timeoutMs?: number;
}

export interface DiscoveredFile {
  path: string;
  sizeBytes: number;
  discoveredAt: Date;
}

export interface TelemetryWatcher {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Emite arquivos que já estabilizaram e abriram para leitura. */
  onReady(listener: (file: DiscoveredFile) => void): void;
  /** Emite arquivos que estouraram o timeout sem estabilizar. */
  onQuarantined(listener: (file: DiscoveredFile, reason: string) => void): void;
}

export function createTelemetryWatcher(_options: WatcherOptions): TelemetryWatcher {
  throw new NotImplementedError('createTelemetryWatcher ainda não foi implementado');
}
