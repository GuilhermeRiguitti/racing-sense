import type {
  ComparisonDto,
  LapDto,
  LiveSnapshotDto,
  LiveTicksDto,
  ReferenceLapDto,
  SeriesDto,
  SessionDto,
  StintLapDto,
} from '../../shared/dto.js';
import type { DesktopEvent } from '../../shared/ipc.js';
import type {
  OverlayFrameDto,
  OverlaySettings,
  OverlaySettingsPatch,
  WidgetId,
} from '../../shared/overlay.js';

/** Resultado de uma chamada pela ponte: sucesso ou falha, nunca exceção. */
export type BridgeResult<T> =
  | { readonly failed?: false; readonly value: T }
  | { readonly failed: true; readonly code: string; readonly message: string };

export interface LapAgainstReference {
  readonly sessionId: string;
  readonly lapNumber: number;
  readonly referenceLapId: string;
}

export interface TelemetryBridge {
  listSessions(): Promise<BridgeResult<readonly SessionDto[]>>;
  listSessionLaps(sessionId: string): Promise<BridgeResult<readonly LapDto[]>>;
  getLapSeries(sessionId: string, lapNumber: number): Promise<BridgeResult<readonly SeriesDto[]>>;
  getSessionStint(sessionId: string): Promise<BridgeResult<readonly StintLapDto[]>>;
  listReferenceLaps(): Promise<BridgeResult<readonly ReferenceLapDto[]>>;
  getReferenceLapSeries(referenceLapId: string): Promise<BridgeResult<readonly SeriesDto[]>>;
  compareLapToReference(request: LapAgainstReference): Promise<BridgeResult<ComparisonDto>>;
  importReferenceLap(request: {
    sessionId: string;
    lapNumber: number;
    label: string;
  }): Promise<BridgeResult<{ referenceLapId: string }>>;
  ingestTelemetryFile(locator: string): Promise<BridgeResult<{ sessionId: string }>>;
  /** O frame mais recente do sim. O catálogo só vem quando difere de `knownCatalogId`. */
  getLiveSnapshot(knownCatalogId: string | null): Promise<BridgeResult<LiveSnapshotDto>>;
  /** Todos os ticks desde `sinceTick`, só dos canais pedidos (ADR 0025). */
  getLiveTicks(request: {
    knownCatalogId: string | null;
    sinceTick: number | null;
    channels: readonly string[];
  }): Promise<BridgeResult<LiveTicksDto>>;
  getOverlayFrame(widget: WidgetId): Promise<BridgeResult<OverlayFrameDto>>;
  getOverlaySettings(): Promise<BridgeResult<OverlaySettings>>;
  updateOverlaySettings(patch: OverlaySettingsPatch): Promise<BridgeResult<OverlaySettings>>;
  /** A janela do overlay diz o tamanho do que desenhou; o processo principal ajusta a janela. */
  fitOverlay(width: number, height: number): void;
  /** Assina os avisos do processo principal. Devolve como cancelar. */
  onEvent(listener: (event: DesktopEvent) => void): () => void;
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
