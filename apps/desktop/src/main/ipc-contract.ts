/**
 * Os canais de IPC entre o renderer e o processo principal.
 *
 * Substituem o servidor HTTP local que existia antes: com Electron, subir um
 * segundo servidor em `localhost` só acrescentaria porta, CORS e superfície de
 * ataque — ver `docs/adr/0011-topologia-tres-aplicacoes.md`.
 *
 * A lista é fechada de propósito. O preload só expõe estes nomes; canal que não
 * está aqui não existe para o renderer.
 */
export const IPC = {
  listSessions: 'sessions:list',
  listSessionLaps: 'sessions:laps',
  getLapSeries: 'laps:series',
  listReferenceLaps: 'reference-laps:list',
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
