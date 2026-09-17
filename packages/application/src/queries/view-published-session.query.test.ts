import { NotFoundError, toPilotId, toSessionId, toShareToken } from '@telemetry/domain';
import { aPublishedSession, aShareLink } from '@telemetry/domain/testing';
import { describe, expect, it } from 'vitest';
import type { PublishedSessionReaderPort } from '../ports/published-session-store.port.js';
import { createViewPublishedSessionQuery } from './view-published-session.query.js';

const dono = toPilotId('piloto-1');
const intruso = toPilotId('piloto-2');
const agora = { now: () => new Date('2026-09-17T12:00:00Z') };

const reader = (
  session: ReturnType<typeof aPublishedSession> | null,
): PublishedSessionReaderPort => ({
  findById: async () => session,
  listByOwner: async () => [],
  listPublic: async () => [],
  findByShareToken: async () => session,
});

describe('ViewPublishedSession', () => {
  const privada = aPublishedSession({ ownerId: dono, visibility: 'private' });

  it('o dono abre a própria sessão privada', async () => {
    const query = createViewPublishedSessionQuery({ reader: reader(privada), clock: agora });

    await expect(
      query({ sessionId: privada.session.id, viewerId: dono, shareToken: null }),
    ).resolves.toMatchObject({ ownerId: dono });
  });

  it('sessão privada de outro responde NotFound, não "proibido"', async () => {
    // Distinguir 403 de 404 já entrega ao curioso que a sessão existe.
    const query = createViewPublishedSessionQuery({ reader: reader(privada), clock: agora });

    await expect(
      query({ sessionId: privada.session.id, viewerId: intruso, shareToken: null }),
    ).rejects.toThrow(NotFoundError);
  });

  it('sessão inexistente e sessão sem permissão respondem igual', async () => {
    const semSessao = createViewPublishedSessionQuery({ reader: reader(null), clock: agora });
    const semPermissao = createViewPublishedSessionQuery({ reader: reader(privada), clock: agora });

    const erroA = await semSessao({
      sessionId: toSessionId('não-existe'),
      viewerId: intruso,
      shareToken: null,
    }).catch((error: Error) => error.message);
    const erroB = await semPermissao({
      sessionId: privada.session.id,
      viewerId: intruso,
      shareToken: null,
    }).catch((error: Error) => error.message);

    expect(erroA).toContain('não encontrada');
    expect(erroB).toContain('não encontrada');
  });

  it('link abre sessão não listada para quem não está logado', async () => {
    const naoListada = aPublishedSession({
      ownerId: dono,
      visibility: 'unlisted',
      shareLinks: [aShareLink()],
    });
    const query = createViewPublishedSessionQuery({ reader: reader(naoListada), clock: agora });

    await expect(
      query({
        sessionId: naoListada.session.id,
        viewerId: null,
        shareToken: toShareToken('token-abc'),
      }),
    ).resolves.toMatchObject({ visibility: 'unlisted' });
  });
});
