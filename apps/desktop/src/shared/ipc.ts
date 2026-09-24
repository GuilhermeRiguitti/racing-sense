/**
 * Os canais de IPC entre o renderer e o processo principal.
 *
 * Com Electron, subir um servidor em `localhost` para a própria tela só
 * acrescentaria porta, CORS e superfície de ataque. Tudo que a tela precisa —
 * sessões, voltas, delta, análise — responde daqui, sem rede.
 *
 * A lista é fechada de propósito. O preload só expõe estes nomes; canal que não
 * está aqui não existe para o renderer.
 */
export const IPC = {
  listSessions: 'sessions:list',
  listSessionLaps: 'sessions:laps',
  getLapSeries: 'laps:series',
  getSessionStint: 'sessions:stint',
  listReferenceLaps: 'reference-laps:list',
  getReferenceLapSeries: 'reference-laps:series',
  compareLapToReference: 'laps:compare',
  getLapAnalysis: 'analysis:get',
  ingestTelemetryFile: 'sessions:ingest',
  importReferenceLap: 'reference-laps:import',
  requestLapAnalysis: 'analysis:request',
  flushPublicationQueue: 'publication:flush',
  currentPilot: 'auth:current',
  signIn: 'auth:sign-in',
  signOut: 'auth:sign-out',
  /**
   * Único canal de mão única: o processo principal empurrando fato novo para a
   * interface. Todos os outros são pergunta e resposta.
   */
  events: 'events:desktop',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/** Canais que a interface chama e espera resposta. O de eventos não é um deles. */
export const REQUEST_CHANNELS = Object.entries(IPC)
  .filter(([name]) => name !== 'events')
  .map(([, channel]) => channel);

/** Erro atravessando o IPC. `Error` não sobrevive à serialização estruturada. */
export interface IpcFailure {
  readonly failed: true;
  readonly code: string;
  readonly message: string;
}

export type IpcResult<T> = { readonly failed?: false; readonly value: T } | IpcFailure;

/**
 * O que o processo principal empurra para a interface enquanto o app está aberto.
 *
 * Evento é **aviso**, não dado: ele diz "olha, mudou", e quem recebe responde
 * consultando de novo. Por isso os payloads são mínimos — nenhum deles carrega
 * série, volta ou relatório. Senão passariam a existir duas versões da mesma
 * verdade, e a que está na tela sumiria no primeiro evento perdido.
 */
export type DesktopEvent =
  | { readonly type: 'session-ingested'; readonly sessionId: string; readonly lapCount: number }
  | {
      readonly type: 'analysis-ready';
      readonly sessionId: string;
      readonly lapNumber: number;
      readonly referenceLapId: string;
    }
  | {
      readonly type: 'publication-progressed';
      readonly published: number;
      readonly failed: number;
    };

export type DesktopEventType = DesktopEvent['type'];
