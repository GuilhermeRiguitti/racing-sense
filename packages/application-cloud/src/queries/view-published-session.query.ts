import type { ClockPort } from '@telemetry/application';
import {
  canView,
  NotFoundError,
  type PilotId,
  type PublishedSession,
  type SessionId,
  type ShareToken,
} from '@telemetry/domain';
import type { PublishedSessionReaderPort } from '../ports/published-session-store.port.js';

export interface ViewPublishedSessionRequest {
  readonly sessionId: SessionId;
  readonly viewerId: PilotId | null;
  readonly shareToken: ShareToken | null;
}

export interface ViewPublishedSessionDeps {
  readonly reader: PublishedSessionReaderPort;
  readonly clock: ClockPort;
}

/**
 * Abre uma sessão publicada, se este visitante puder vê-la.
 *
 * A decisão de acesso é do domínio (`canView`), num lugar só, testada. O que
 * esta query acrescenta é a tradução: **sem permissão responde `NotFound`**, não
 * "proibido" — distinguir os dois entrega ao curioso que a sessão existe.
 */
export function createViewPublishedSessionQuery(deps: ViewPublishedSessionDeps) {
  return async (request: ViewPublishedSessionRequest): Promise<PublishedSession> => {
    const published = await deps.reader.findById(request.sessionId);
    const viewer = { pilotId: request.viewerId, shareToken: request.shareToken };

    if (published === null || !canView(published, viewer, deps.clock.now())) {
      throw new NotFoundError(`Sessão ${request.sessionId} não encontrada`);
    }

    return published;
  };
}
