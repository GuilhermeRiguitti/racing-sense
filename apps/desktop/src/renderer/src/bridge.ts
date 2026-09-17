import type { TelemetryBridge } from '../../preload/index.js';

declare global {
  interface Window {
    readonly telemetry: TelemetryBridge;
  }
}

/**
 * O único caminho do front para o resto do sistema.
 *
 * Não existe `fetch` para `localhost` aqui, nem acesso a disco: tudo passa pelos
 * canais declarados no preload.
 */
export const bridge = (): TelemetryBridge => window.telemetry;
