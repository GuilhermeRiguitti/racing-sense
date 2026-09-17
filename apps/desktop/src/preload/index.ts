import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../main/ipc-contract.js';

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
  listReferenceLaps: () => ipcRenderer.invoke(IPC.listReferenceLaps),
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
};

contextBridge.exposeInMainWorld('telemetry', api);

export type TelemetryBridge = typeof api;
