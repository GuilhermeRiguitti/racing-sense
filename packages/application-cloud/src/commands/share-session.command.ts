import type { ClockPort } from '@telemetry/application';
import {
  NotFoundError,
  type PilotId,
  type SessionId,
  type ShareLink,
  type ShareToken,
} from '@telemetry/domain';
import type {
  PublishedSessionReaderPort,
  PublishedSessionWriterPort,
  ShareTokenGeneratorPort,
} from '../ports/published-session-store.port.js';

export interface ShareSessionCommand {
  readonly sessionId: SessionId;
  readonly actorId: PilotId;
}

export interface ShareSessionDeps {
  readonly reader: PublishedSessionReaderPort;
  readonly writer: PublishedSessionWriterPort;
  readonly tokens: ShareTokenGeneratorPort;
  readonly clock: ClockPort;
}

/**
 * Cria um link de compartilhamento para uma sessão.
 *
 * Compartilhar move a sessão para `unlisted`: ela deixa de ser privada, mas não
 * entra no perfil nem em busca — só quem tem o link entra. Para fechar de novo,
 * o piloto volta a visibilidade para `private`, e aí nem quem já tinha o link vê
 * (a regra está em `canView`, no domínio).
 *
 * Devolve só o token — é comando, e o token é o identificador do que foi criado.
 */
export function createShareSessionHandler(deps: ShareSessionDeps) {
  return async ({ sessionId, actorId }: ShareSessionCommand): Promise<ShareToken> => {
    const published = await deps.reader.findById(sessionId);
    if (published === null || published.ownerId !== actorId) {
      throw new NotFoundError(`Sessão ${sessionId} não encontrada`);
    }

    const link: ShareLink = {
      token: deps.tokens.next(),
      createdAt: deps.clock.now(),
      revokedAt: null,
    };

    await deps.writer.addShareLink(sessionId, link);
    if (published.visibility === 'private') {
      await deps.writer.setVisibility(sessionId, 'unlisted');
    }

    return link.token;
  };
}
