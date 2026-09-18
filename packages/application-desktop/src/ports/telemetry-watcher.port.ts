/**
 * Observação de novos arquivos de telemetria.
 *
 * O watcher só avisa que um arquivo **está pronto para ser lido** — arquivo
 * ainda travado pelo sim ou incompleto não chega aqui. Essa espera é problema
 * do adapter, não do caso de uso.
 */
export interface DiscoveredTelemetryFile {
  readonly locator: string;
  readonly sizeBytes: number;
  readonly discoveredAt: Date;
}

export interface TelemetryWatcherPort {
  start(): Promise<void>;
  stop(): Promise<void>;
  onFileReady(listener: (file: DiscoveredTelemetryFile) => void): void;
  /** Arquivo que nunca estabilizou. Não some em silêncio. */
  onFileRejected(listener: (file: DiscoveredTelemetryFile, reason: string) => void): void;
}
