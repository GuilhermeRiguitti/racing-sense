import { NotFoundError, toPilotId, toShareToken } from '@telemetry/domain';
import { aPublishedSession } from '@telemetry/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import type {
  PublishedSessionReaderPort,
  PublishedSessionWriterPort,
} from '../ports/published-session-store.port.js';
import { createShareSessionHandler } from './share-session.command.js';

const dono = toPilotId('piloto-1');
const intruso = toPilotId('piloto-2');
const privada = aPublishedSession({ ownerId: dono, visibility: 'private' });

const reader = (session = privada): PublishedSessionReaderPort => ({
  findById: async () => session,
  listByOwner: async () => [],
  listPublic: async () => [],
  findByShareToken: async () => null,
});

const writer = (): PublishedSessionWriterPort => ({
  save: vi.fn(),
  setVisibility: vi.fn(async () => undefined),
  addShareLink: vi.fn(async () => undefined),
  revokeShareLink: vi.fn(),
});

const deps = (w: PublishedSessionWriterPort, session = privada) => ({
  reader: reader(session),
  writer: w,
  tokens: { next: () => toShareToken('token-novo') },
  clock: { now: () => new Date('2026-09-17T12:00:00Z') },
});

describe('ShareSession', () => {
  it('cria o link e move a sessão privada para não listada', async () => {
    const w = writer();

    const token = await createShareSessionHandler(deps(w))({
      sessionId: privada.session.id,
      actorId: dono,
    });

    expect(token).toBe('token-novo');
    expect(w.addShareLink).toHaveBeenCalled();
    expect(w.setVisibility).toHaveBeenCalledWith(privada.session.id, 'unlisted');
  });

  it('não rebaixa sessão que já era pública', async () => {
    const w = writer();
    const publica = aPublishedSession({ ownerId: dono, visibility: 'public' });

    await createShareSessionHandler(deps(w, publica))({
      sessionId: publica.session.id,
      actorId: dono,
    });

    expect(w.setVisibility).not.toHaveBeenCalled();
  });

  it('outro piloto não compartilha sessão que não é dele', async () => {
    const w = writer();

    await expect(
      createShareSessionHandler(deps(w))({ sessionId: privada.session.id, actorId: intruso }),
    ).rejects.toThrow(NotFoundError);
    expect(w.addShareLink).not.toHaveBeenCalled();
  });
});
