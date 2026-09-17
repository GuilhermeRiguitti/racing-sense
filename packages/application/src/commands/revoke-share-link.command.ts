import { NotFoundError, type PilotId, type SessionId, type ShareToken } from '@telemetry/domain';
import type {
  PublishedSessionReaderPort,
  PublishedSessionWriterPort,
} from '../ports/published-session-store.port.js';
import type { ClockPort } from '../ports/system.port.js';

export interface RevokeShareLinkCommand {
  readonly sessionId: SessionId;
  readonly actorId: PilotId;
  readonly token: ShareToken;
}

export interface RevokeShareLinkDeps {
  readonly reader: PublishedSessionReaderPort;
  readonly writer: PublishedSessionWriterPort;
  readonly clock: ClockPort;
}

/** Derruba um link já distribuído. Quem tinha o endereço para de entrar. */
export function createRevokeShareLinkHandler(deps: RevokeShareLinkDeps) {
  return async ({ sessionId, actorId, token }: RevokeShareLinkCommand): Promise<void> => {
    const published = await deps.reader.findById(sessionId);
    if (published === null || published.ownerId !== actorId) {
      throw new NotFoundError(`Sessão ${sessionId} não encontrada`);
    }

    await deps.writer.revokeShareLink(sessionId, token, deps.clock.now());
  };
}
