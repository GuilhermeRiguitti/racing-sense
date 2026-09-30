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
   * O frame mais recente do sim, lido na hora (ADR 0023). A tela pergunta no
   * ritmo em que desenha: frame ao vivo não vira evento, para não existirem duas
   * versões do mesmo instante.
   */
  getLiveSnapshot: 'live:snapshot',
  /**
   * Todos os ticks novos desde o último que a tela tem, só dos canais pedidos
   * (ADR 0025). É o que desenha o pedal e a volta ao vivo tick a tick.
   */
  getLiveTicks: 'live:ticks',
  /** O quadro de um widget do overlay, montado uma vez por tick (ADR 0025). */
  getOverlayFrame: 'overlay:frame',
  getOverlaySettings: 'overlay:settings',
  updateOverlaySettings: 'overlay:settings-update',
  /**
   * A janela do overlay dizendo o tamanho do que desenhou. É de mão única, da
   * janela para o processo principal, e só vale para janela de overlay: quem
   * responde é o gerenciador das janelas, não os handlers.
   */
  overlayFit: 'overlay:fit',
  /**
   * Único canal de mão única: o processo principal empurrando fato novo para a
   * interface. Todos os outros são pergunta e resposta.
   */
  events: 'events:desktop',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/** Canais de mão única, sem resposta: os eventos e o tamanho da janela do overlay. */
const ONE_WAY_CHANNELS: readonly string[] = ['events', 'overlayFit'];

/** Canais que a interface chama e espera resposta. */
export const REQUEST_CHANNELS = Object.entries(IPC)
  .filter(([name]) => !ONE_WAY_CHANNELS.includes(name))
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
    }
  /** O piloto mexeu no overlay: as janelas consultam a configuração de novo. */
  | { readonly type: 'overlay-settings-changed' };

export type DesktopEventType = DesktopEvent['type'];
