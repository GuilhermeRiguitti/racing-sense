import { NotFoundError, type PilotId, type SessionId, type Visibility } from '@telemetry/domain';
import type {
  PublishedSessionReaderPort,
  PublishedSessionWriterPort,
} from '../ports/published-session-store.port.js';

export interface SetSessionVisibilityCommand {
  readonly sessionId: SessionId;
  readonly actorId: PilotId;
  readonly visibility: Visibility;
}

export interface SetSessionVisibilityDeps {
  readonly reader: PublishedSessionReaderPort;
  readonly writer: PublishedSessionWriterPort;
}

/**
 * Muda quem pode ver uma sessão. Roda no servidor.
 *
 * Sessão de outro piloto responde `NotFound`, não "proibido": dizer "existe, mas
 * você não pode" já entrega que ela existe.
 */
export function createSetSessionVisibilityHandler(deps: SetSessionVisibilityDeps) {
  return async ({ sessionId, actorId, visibility }: SetSessionVisibilityCommand): Promise<void> => {
    const published = await deps.reader.findById(sessionId);
    if (published === null || published.ownerId !== actorId) {
      throw new NotFoundError(`Sessão ${sessionId} não encontrada`);
    }

    await deps.writer.setVisibility(sessionId, visibility);
  };
}
