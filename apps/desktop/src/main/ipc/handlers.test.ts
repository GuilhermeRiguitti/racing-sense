import { describe, expect, it, vi } from 'vitest';
import { IPC, type IpcResult, REQUEST_CHANNELS } from '../../shared/ipc.js';
import { openLocalStore } from '../db/local-store.js';
import type { Desktop } from '../desktop.js';
import { aLap, aReferenceLap, aSeries, aSession } from '../domain/testing.js';
import { registerIpcHandlers } from './handlers.js';

/** Simula o `ipcMain.handle` do Electron sem subir Electron nenhum. */
function ipcBus() {
  const handlers = new Map<string, (payload: unknown) => Promise<unknown>>();
  const register = (channel: string, handler: (payload: unknown) => Promise<unknown>) => {
    handlers.set(channel, handler);
  };
  const invoke = async <T>(channel: string, payload?: unknown): Promise<IpcResult<T>> => {
    const handler = handlers.get(channel);
    if (handler === undefined) {
      throw new Error(`canal não registrado: ${channel}`);
    }
    return (await handler(payload)) as IpcResult<T>;
  };
  return { register, invoke, channels: handlers };
}

/** Desktop com banco em memória de verdade; só a nuvem e o modelo são falsos. */
function desktop(overrides: Partial<Desktop> = {}): Desktop {
  const store = openLocalStore(':memory:');
  const session = aSession();
  store.saveRecording({
    session,
    laps: [aLap({ number: 3, startSample: 0, endSample: 2, lapTimeSeconds: 0.05 })],
    seriesByLap: new Map([[3, [aSeries()]]]),
  });
  store.saveReferenceLap(
    aReferenceLap({ lap: aLap({ startSample: 0, endSample: 2, lapTimeSeconds: 0.05 }) }),
  );
  return {
    store,
    api: {} as Desktop['api'],
    narrate: vi.fn(async () => ({ summary: 'Resumo', findings: [], model: 'fake' })),
    emit: vi.fn(),
    watcher: {} as Desktop['watcher'],
    ...overrides,
  };
}

describe('handlers de IPC', () => {
  it('registra exatamente os canais de pergunta e resposta', () => {
    const bus = ipcBus();

    registerIpcHandlers(desktop(), bus.register);

    expect([...bus.channels.keys()].sort()).toEqual([...REQUEST_CHANNELS].sort());
  });

  it('o canal de eventos não tem handler: ele é de mão única', () => {
    const bus = ipcBus();

    registerIpcHandlers(desktop(), bus.register);

    // Quem empurra evento é o processo principal, não a interface perguntando.
    expect(bus.channels.has(IPC.events)).toBe(false);
  });

  it('devolve DTO, não modelo de domínio', async () => {
    const bus = ipcBus();
    registerIpcHandlers(desktop(), bus.register);

    const resultado = await bus.invoke<{ trackName: string }[]>(IPC.listSessions);

    expect(resultado).not.toHaveProperty('failed', true);
    if (resultado.failed !== true) {
      // `track` virou `trackName`: o front não recebe o modelo interno.
      expect(resultado.value[0]).toHaveProperty('trackName');
      expect(resultado.value[0]).not.toHaveProperty('track');
    }
  });

  it('traduz erro de domínio em código, porque Error não atravessa o IPC', async () => {
    const bus = ipcBus();
    registerIpcHandlers(desktop(), bus.register);

    const resultado = await bus.invoke(IPC.listSessionLaps, { sessionId: 'xyz' });

    expect(resultado).toMatchObject({ failed: true, code: 'NOT_FOUND' });
  });

  it('erro inesperado não vaza stack para o renderer', async () => {
    const bus = ipcBus();
    const quebrado = openLocalStore(':memory:');
    quebrado.close();
    registerIpcHandlers(desktop({ store: quebrado }), bus.register);

    const resultado = await bus.invoke(IPC.listSessions);

    expect(resultado).toMatchObject({ failed: true, code: 'INTERNAL' });
    expect(resultado).not.toHaveProperty('stack');
  });

  it('pedir análise não devolve o relatório — quem quer, consulta depois', async () => {
    const bus = ipcBus();
    const app = desktop();
    registerIpcHandlers(app, bus.register);
    const pedido = { sessionId: 'session-1', lapNumber: 3, referenceLapId: 'reference-1' };

    expect(await bus.invoke(IPC.requestLapAnalysis, pedido)).toEqual({ value: null });
    expect(app.narrate).toHaveBeenCalledOnce();
    expect(await bus.invoke(IPC.getLapAnalysis, pedido)).toMatchObject({
      value: { summary: 'Resumo' },
    });
  });
});
