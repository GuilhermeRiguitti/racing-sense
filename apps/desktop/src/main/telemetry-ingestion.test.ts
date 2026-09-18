import type { DiscoveredTelemetryFile, TelemetryWatcherPort } from '@telemetry/application-desktop';
import { toSessionId } from '@telemetry/domain';
import { describe, expect, it, vi } from 'vitest';
import { createIngestionService } from './telemetry-ingestion.js';

/** Watcher falso: o teste dispara os arquivos na mão. */
function watcherFalso(): TelemetryWatcherPort & {
  emitirPronto(file: DiscoveredTelemetryFile): void;
  emitirRecusado(file: DiscoveredTelemetryFile, reason: string): void;
} {
  const prontos: ((file: DiscoveredTelemetryFile) => void)[] = [];
  const recusados: ((file: DiscoveredTelemetryFile, reason: string) => void)[] = [];

  return {
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    onFileReady: (listener) => prontos.push(listener),
    onFileRejected: (listener) => recusados.push(listener),
    emitirPronto: (file) => {
      for (const listener of prontos) listener(file);
    },
    emitirRecusado: (file, reason) => {
      for (const listener of recusados) listener(file, reason);
    },
  };
}

const arquivo = (nome: string): DiscoveredTelemetryFile => ({
  locator: `C:\\telemetry\\${nome}`,
  sizeBytes: 4096,
  discoveredAt: new Date('2026-09-18T20:00:00Z'),
});

describe('IngestionService', () => {
  it('ingere o arquivo que o watcher liberou', async () => {
    const watcher = watcherFalso();
    const ingestTelemetryFile = vi.fn(async () => toSessionId('session-1'));
    const onIngested = vi.fn();

    const service = createIngestionService({ watcher, ingestTelemetryFile, onIngested });
    await service.start();
    watcher.emitirPronto(arquivo('sessao.ibt'));
    await service.stop();

    expect(ingestTelemetryFile).toHaveBeenCalledWith({ locator: 'C:\\telemetry\\sessao.ibt' });
    expect(onIngested).toHaveBeenCalledWith(expect.anything(), 'session-1');
  });

  it('processa um arquivo por vez, sem brigar por CPU com o sim', async () => {
    const watcher = watcherFalso();
    let emExecucao = 0;
    let maximoSimultaneo = 0;

    const ingestTelemetryFile = vi.fn(async () => {
      emExecucao += 1;
      maximoSimultaneo = Math.max(maximoSimultaneo, emExecucao);
      await new Promise((resolve) => setTimeout(resolve, 5));
      emExecucao -= 1;
      return toSessionId('session-x');
    });

    const service = createIngestionService({ watcher, ingestTelemetryFile });
    await service.start();
    for (const nome of ['a.ibt', 'b.ibt', 'c.ibt']) {
      watcher.emitirPronto(arquivo(nome));
    }
    await service.stop();

    expect(ingestTelemetryFile).toHaveBeenCalledTimes(3);
    expect(maximoSimultaneo).toBe(1);
  });

  it('arquivo que falha não impede os seguintes', async () => {
    const watcher = watcherFalso();
    const onProblem = vi.fn();
    const ingestTelemetryFile = vi.fn(async ({ locator }: { locator: string }) => {
      if (locator.endsWith('ruim.ibt')) {
        throw new Error('canal Lap faltando');
      }
      return toSessionId('session-boa');
    });

    const service = createIngestionService({ watcher, ingestTelemetryFile, onProblem });
    await service.start();
    watcher.emitirPronto(arquivo('ruim.ibt'));
    watcher.emitirPronto(arquivo('boa.ibt'));
    await service.stop();

    expect(ingestTelemetryFile).toHaveBeenCalledTimes(2);
    expect(onProblem).toHaveBeenCalledWith(expect.anything(), 'canal Lap faltando');
  });

  it('arquivo recusado pelo watcher vira aviso, não silêncio', async () => {
    const watcher = watcherFalso();
    const onProblem = vi.fn();
    const ingestTelemetryFile = vi.fn();

    const service = createIngestionService({ watcher, ingestTelemetryFile, onProblem });
    await service.start();
    watcher.emitirRecusado(arquivo('travada.ibt'), 'arquivo não estabilizou em 300s');
    await service.stop();

    expect(ingestTelemetryFile).not.toHaveBeenCalled();
    expect(onProblem).toHaveBeenCalledWith(expect.anything(), 'arquivo não estabilizou em 300s');
  });

  it('parar espera a ingestão em andamento terminar', async () => {
    const watcher = watcherFalso();
    let terminou = false;
    const ingestTelemetryFile = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      terminou = true;
      return toSessionId('session-1');
    });

    const service = createIngestionService({ watcher, ingestTelemetryFile });
    await service.start();
    watcher.emitirPronto(arquivo('sessao.ibt'));
    await service.stop();

    // Matar no meio deixaria sessão gravada pela metade.
    expect(terminou).toBe(true);
  });
});
