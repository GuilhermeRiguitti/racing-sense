import { type Lap, NotFoundError, type SessionId } from '@telemetry/domain';
import type { SessionReaderPort } from '../ports/session-store.port.js';

export interface ListSessionLapsRequest {
  readonly sessionId: SessionId;
}

export interface ListSessionLapsDeps {
  readonly sessions: SessionReaderPort;
}

export type ListSessionLapsQuery = (request: ListSessionLapsRequest) => Promise<readonly Lap[]>;

export function createListSessionLapsQuery(deps: ListSessionLapsDeps): ListSessionLapsQuery {
  return async ({ sessionId }) => {
    const session = await deps.sessions.findById(sessionId);
    if (session === null) {
      throw new NotFoundError(`Sessão ${sessionId} não encontrada`);
    }
    return deps.sessions.listLaps(sessionId);
  };
}
