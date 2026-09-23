import type { EventPublisherPort } from '../ports/event-publisher.port.js';
import type { PublicationQueuePort, SessionPublisherPort } from '../ports/publication.port.js';

export interface FlushPublicationQueueCommand {
  /** Quantas sessões tentar nesta rodada. */
  readonly batchSize?: number;
}

export interface FlushPublicationQueueDeps {
  readonly queue: PublicationQueuePort;
  readonly publisher: SessionPublisherPort;
  readonly events: EventPublisherPort;
}

export interface FlushResult {
  readonly published: number;
  readonly failed: number;
}

/**
 * Tenta enviar para a nuvem o que está na fila.
 *
 * Roda em segundo plano, fora do caminho de qualquer coisa que o piloto esteja
 * fazendo. Falha de rede **não é erro do usuário**: a sessão continua na fila e
 * a próxima rodada tenta de novo. É isso que faz o app do Windows ser autônomo
 * de verdade (ADR 0011).
 *
 * Devolve uma contagem, não os dados publicados: continua sendo comando.
 */
export function createFlushPublicationQueueHandler(deps: FlushPublicationQueueDeps) {
  return async ({ batchSize = 10 }: FlushPublicationQueueCommand = {}): Promise<FlushResult> => {
    const pending = await deps.queue.pending(batchSize);
    let published = 0;
    let failed = 0;

    for (const sessionId of pending) {
      try {
        await deps.publisher.publish(sessionId);
        await deps.queue.markPublished(sessionId);
        published += 1;
      } catch (error) {
        // Uma sessão que falha não pode impedir as outras de subir.
        await deps.queue.markFailed(
          sessionId,
          error instanceof Error ? error.message : 'falha desconhecida',
        );
        failed += 1;
      }
    }

    // Rodada silenciosa não vira evento: a fila trabalha em segundo plano e não
    // deve piscar nada na tela quando não há o que contar.
    if (published > 0 || failed > 0) {
      deps.events.publish({ type: 'publication-progressed', published, failed });
    }

    return { published, failed };
  };
}
