import { describe, expect, it, vi } from 'vitest';
import { createIngestionService } from './ingestion-service.js';
import type { DiscoveredTelemetryFile, TelemetryWatcher } from './watcher.js';

/** Watcher falso: o teste dispara os arquivos na mão. */
function watcherFalso(): TelemetryWatcher & {
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
    const ingest = vi.fn(async () => 'session-1');
    const onIngested = vi.fn();

    const service = createIngestionService({ watcher, ingest, onIngested });
    await service.start();
    watcher.emitirPronto(arquivo('sessao.ibt'));
    await service.stop();

    expect(ingest).toHaveBeenCalledWith('C:\\telemetry\\sessao.ibt');
    expect(onIngested).toHaveBeenCalledWith(expect.anything(), 'session-1');
  });

  it('processa um arquivo por vez, sem brigar por CPU com o sim', async () => {
    const watcher = watcherFalso();
    let emExecucao = 0;
    let maximoSimultaneo = 0;

    const ingest = vi.fn(async () => {
      emExecucao += 1;
      maximoSimultaneo = Math.max(maximoSimultaneo, emExecucao);
      await new Promise((resolve) => setTimeout(resolve, 5));
      emExecucao -= 1;
      return 'session-x';
    });

    const service = createIngestionService({ watcher, ingest });
    await service.start();
    for (const nome of ['a.ibt', 'b.ibt', 'c.ibt']) {
      watcher.emitirPronto(arquivo(nome));
    }
    await service.stop();

    expect(ingest).toHaveBeenCalledTimes(3);
    expect(maximoSimultaneo).toBe(1);
  });

  it('arquivo que falha não impede os seguintes', async () => {
    const watcher = watcherFalso();
    const onProblem = vi.fn();
    const ingest = vi.fn(async (locator: string) => {
      if (locator.endsWith('ruim.ibt')) {
        throw new Error('canal Lap faltando');
      }
      return 'session-boa';
    });

    const service = createIngestionService({ watcher, ingest, onProblem });
    await service.start();
    watcher.emitirPronto(arquivo('ruim.ibt'));
    watcher.emitirPronto(arquivo('boa.ibt'));
    await service.stop();

    expect(ingest).toHaveBeenCalledTimes(2);
    expect(onProblem).toHaveBeenCalledWith(expect.anything(), 'canal Lap faltando');
  });

  it('arquivo recusado pelo watcher vira aviso, não silêncio', async () => {
    const watcher = watcherFalso();
    const onProblem = vi.fn();
    const ingest = vi.fn();

    const service = createIngestionService({ watcher, ingest, onProblem });
    await service.start();
    watcher.emitirRecusado(arquivo('travada.ibt'), 'arquivo não estabilizou em 300s');
    await service.stop();

    expect(ingest).not.toHaveBeenCalled();
    expect(onProblem).toHaveBeenCalledWith(expect.anything(), 'arquivo não estabilizou em 300s');
  });

  it('parar espera a ingestão em andamento terminar', async () => {
    const watcher = watcherFalso();
    let terminou = false;
    const ingest = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      terminou = true;
      return 'session-1';
    });

    const service = createIngestionService({ watcher, ingest });
    await service.start();
    watcher.emitirPronto(arquivo('sessao.ibt'));
    await service.stop();

    // Matar no meio deixaria sessão gravada pela metade.
    expect(terminou).toBe(true);
  });
});
