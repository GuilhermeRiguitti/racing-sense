import { toSessionId } from '@telemetry/domain';
import { describe, expect, it, vi } from 'vitest';
import type { PublicationQueuePort, SessionPublisherPort } from '../ports/publication.port.js';
import { createFlushPublicationQueueHandler } from './flush-publication-queue.command.js';

const a = toSessionId('session-a');
const b = toSessionId('session-b');

function queue(pending: readonly ReturnType<typeof toSessionId>[]): PublicationQueuePort {
  return {
    enqueue: vi.fn(async () => undefined),
    pending: async () => pending,
    markPublished: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
  };
}

describe('FlushPublicationQueue', () => {
  it('publica o que está na fila e marca como enviado', async () => {
    const fila = queue([a, b]);
    const publisher: SessionPublisherPort = { publish: vi.fn(async () => undefined) };

    const resultado = await createFlushPublicationQueueHandler({ queue: fila, publisher })();

    expect(resultado).toEqual({ published: 2, failed: 0 });
    expect(fila.markPublished).toHaveBeenCalledTimes(2);
  });

  it('uma sessão que falha não impede as outras de subir', async () => {
    const fila = queue([a, b]);
    const publisher: SessionPublisherPort = {
      publish: vi.fn(async (id) => {
        if (id === a) throw new Error('sem rede');
      }),
    };

    const resultado = await createFlushPublicationQueueHandler({ queue: fila, publisher })();

    expect(resultado).toEqual({ published: 1, failed: 1 });
    expect(fila.markFailed).toHaveBeenCalledWith(a, 'sem rede');
    expect(fila.markPublished).toHaveBeenCalledWith(b);
  });

  it('falha de rede não vira erro para quem chamou — a sessão fica na fila', async () => {
    const fila = queue([a]);
    const publisher: SessionPublisherPort = {
      publish: async () => {
        throw new Error('ECONNREFUSED');
      },
    };

    await expect(createFlushPublicationQueueHandler({ queue: fila, publisher })()).resolves.toEqual(
      { published: 0, failed: 1 },
    );
  });
});
