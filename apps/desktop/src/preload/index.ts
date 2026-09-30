import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron';
import type { DesktopEvent } from '../shared/ipc.js';
import { IPC } from '../shared/ipc.js';

/**
 * A ponte entre o renderer e o processo principal.
 *
 * Expõe **só** os canais declarados em `IPC`. O renderer não recebe `ipcRenderer`
 * nem nada que permita inventar canal — é o que impede uma falha no front de
 * virar acesso ao disco do piloto.
 */
const api = {
  listSessions: () => ipcRenderer.invoke(IPC.listSessions),
  listSessionLaps: (sessionId: string) => ipcRenderer.invoke(IPC.listSessionLaps, { sessionId }),
  getLapSeries: (sessionId: string, lapNumber: number) =>
    ipcRenderer.invoke(IPC.getLapSeries, { sessionId, lapNumber }),
  getSessionStint: (sessionId: string) => ipcRenderer.invoke(IPC.getSessionStint, { sessionId }),
  listReferenceLaps: () => ipcRenderer.invoke(IPC.listReferenceLaps),
  getReferenceLapSeries: (referenceLapId: string) =>
    ipcRenderer.invoke(IPC.getReferenceLapSeries, { referenceLapId }),
  compareLapToReference: (request: {
    sessionId: string;
    lapNumber: number;
    referenceLapId: string;
  }) => ipcRenderer.invoke(IPC.compareLapToReference, request),
  getLapAnalysis: (request: { sessionId: string; lapNumber: number; referenceLapId: string }) =>
    ipcRenderer.invoke(IPC.getLapAnalysis, request),
  ingestTelemetryFile: (locator: string) =>
    ipcRenderer.invoke(IPC.ingestTelemetryFile, { locator }),
  importReferenceLap: (request: { sessionId: string; lapNumber: number; label: string }) =>
    ipcRenderer.invoke(IPC.importReferenceLap, request),
  requestLapAnalysis: (request: { sessionId: string; lapNumber: number; referenceLapId: string }) =>
    ipcRenderer.invoke(IPC.requestLapAnalysis, request),
  currentPilot: () => ipcRenderer.invoke(IPC.currentPilot),
  signIn: (credentials: { email: string; password: string }) =>
    ipcRenderer.invoke(IPC.signIn, credentials),
  signOut: () => ipcRenderer.invoke(IPC.signOut),
  getLiveSnapshot: (knownCatalogId: string | null) =>
    ipcRenderer.invoke(IPC.getLiveSnapshot, { knownCatalogId }),
  getLiveTicks: (request: {
    knownCatalogId: string | null;
    sinceTick: number | null;
    channels: readonly string[];
  }) => ipcRenderer.invoke(IPC.getLiveTicks, request),
  getOverlayFrame: (widget: string) => ipcRenderer.invoke(IPC.getOverlayFrame, { widget }),
  getOverlaySettings: () => ipcRenderer.invoke(IPC.getOverlaySettings),
  updateOverlaySettings: (patch: unknown) => ipcRenderer.invoke(IPC.updateOverlaySettings, patch),
  /** Mão única: a janela do overlay diz o tamanho do que desenhou. */
  fitOverlay: (width: number, height: number) => {
    ipcRenderer.send(IPC.overlayFit, { width, height });
  },
  /** Mão única: o piloto apertou (`start`) ou soltou (`end`) o botão sobre a janela destravada. */
  dragOverlay: (phase: 'start' | 'end') => {
    ipcRenderer.send(IPC.overlayDrag, { phase });
  },

  /**
   * Assina os avisos do processo principal e devolve como cancelar.
   *
   * Devolver o cancelamento não é detalhe: sem isso, cada remontagem de
   * componente empilharia um ouvinte, e o aplicativo que fica aberto a noite
   * inteira acumularia vazamento.
   *
   * O `IpcRendererEvent` fica deste lado da ponte — o renderer recebe só o
   * evento, sem nada do Electron junto.
   */
  onEvent: (listener: (event: DesktopEvent) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, payload: DesktopEvent): void => {
      listener(payload);
    };
    ipcRenderer.on(IPC.events, handler);
    return () => {
      ipcRenderer.removeListener(IPC.events, handler);
    };
  },
};

contextBridge.exposeInMainWorld('telemetry', api);

export type TelemetryBridge = typeof api;
