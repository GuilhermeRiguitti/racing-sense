import { NotFoundError } from '@telemetry/domain';
import { aLap, aSession } from '@telemetry/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import type { Desktop } from './composition-root.js';
import { IPC, type IpcResult } from './ipc-contract.js';
import { registerIpcHandlers } from './ipc-handlers.js';

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

function desktopWith(overrides: Partial<Desktop['useCases']> = {}): Desktop {
  return {
    db: { close: vi.fn() } as unknown as Desktop['db'],
    identity: {
      signIn: vi.fn(),
      signOut: vi.fn(),
      currentPilot: async () => null,
    },
    catalog: { listPublicSessions: async () => [] },
    useCases: {
      listSessions: async () => [aSession()],
      listSessionLaps: async () => [aLap()],
      listReferenceLaps: async () => [],
      compareLapToReference: vi.fn(),
      getLapAnalysis: vi.fn(),
      ingestTelemetryFile: vi.fn(),
      importReferenceLap: vi.fn(),
      requestLapAnalysis: vi.fn(async () => undefined),
      flushPublicationQueue: vi.fn(async () => ({ published: 0, failed: 0 })),
      ...overrides,
    } as Desktop['useCases'],
  };
}

describe('handlers de IPC', () => {
  it('registra exatamente os canais declarados no contrato', () => {
    const bus = ipcBus();

    registerIpcHandlers(desktopWith(), bus.register);

    for (const channel of Object.values(IPC)) {
      expect(bus.channels.has(channel)).toBe(true);
    }
  });

  it('devolve DTO, não modelo de domínio', async () => {
    const bus = ipcBus();
    registerIpcHandlers(desktopWith(), bus.register);

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
    registerIpcHandlers(
      desktopWith({
        listSessionLaps: async () => {
          throw new NotFoundError('Sessão xyz não encontrada');
        },
      }),
      bus.register,
    );

    const resultado = await bus.invoke(IPC.listSessionLaps, { sessionId: 'xyz' });

    expect(resultado).toMatchObject({ failed: true, code: 'NOT_FOUND' });
  });

  it('erro inesperado não vaza stack para o renderer', async () => {
    const bus = ipcBus();
    registerIpcHandlers(
      desktopWith({
        listSessions: async () => {
          throw new Error('boom');
        },
      }),
      bus.register,
    );

    expect(await bus.invoke(IPC.listSessions)).toEqual({
      failed: true,
      code: 'INTERNAL',
      message: 'boom',
    });
  });

  it('comando de análise não devolve o relatório — quem quer, consulta depois', async () => {
    const bus = ipcBus();
    const requestLapAnalysis = vi.fn(async () => undefined);
    registerIpcHandlers(desktopWith({ requestLapAnalysis }), bus.register);

    const resultado = await bus.invoke(IPC.requestLapAnalysis, {
      sessionId: 'session-1',
      lapNumber: 3,
      referenceLapId: 'reference-1',
    });

    expect(resultado).toEqual({ value: null });
    expect(requestLapAnalysis).toHaveBeenCalledOnce();
  });
});
