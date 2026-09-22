import type { DesktopEventDto, LapDto, SeriesDto, SessionDto } from '@telemetry/contracts';

/** Resultado de uma chamada pela ponte: sucesso ou falha, nunca exceção. */
export type BridgeResult<T> =
  | { readonly failed?: false; readonly value: T }
  | { readonly failed: true; readonly code: string; readonly message: string };

export interface TelemetryBridge {
  listSessions(): Promise<BridgeResult<readonly SessionDto[]>>;
  listSessionLaps(sessionId: string): Promise<BridgeResult<readonly LapDto[]>>;
  getLapSeries(sessionId: string, lapNumber: number): Promise<BridgeResult<readonly SeriesDto[]>>;
  listReferenceLaps(): Promise<BridgeResult<readonly unknown[]>>;
  ingestTelemetryFile(locator: string): Promise<BridgeResult<{ sessionId: string }>>;
  /** Assina os avisos do processo principal. Devolve como cancelar. */
  onEvent(listener: (event: DesktopEventDto) => void): () => void;
}

declare global {
  interface Window {
    readonly telemetry: TelemetryBridge;
  }
}

/**
 * O único caminho do front para o resto do sistema.
 *
 * Não existe `fetch` para `localhost` aqui, nem acesso a disco: tudo passa
 * pelos canais declarados no preload.
 */
export const bridge = (): TelemetryBridge => window.telemetry;
