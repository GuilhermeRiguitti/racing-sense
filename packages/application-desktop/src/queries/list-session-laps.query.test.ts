import { NotFoundError, toSessionId } from '@telemetry/domain';
import { aLap, aSession } from '@telemetry/domain/testing';
import { describe, expect, it } from 'vitest';
import type { SessionReaderPort } from '../ports/session-store.port.js';
import { createListSessionLapsQuery } from './list-session-laps.query.js';
import { createListSessionsQuery } from './list-sessions.query.js';

const session = aSession();

const reader = (overrides: Partial<SessionReaderPort> = {}): SessionReaderPort => ({
  list: async () => [session],
  findById: async () => session,
  listLaps: async () => [aLap({ number: 1 }), aLap({ number: 2 })],
  readLapSeries: async () => [],
  ...overrides,
});

describe('ListSessions', () => {
  it('devolve o que o leitor tem', async () => {
    const query = createListSessionsQuery({ sessions: reader() });

    await expect(query()).resolves.toHaveLength(1);
  });
});

describe('ListSessionLaps', () => {
  it('lista as voltas da sessão', async () => {
    const query = createListSessionLapsQuery({ sessions: reader() });

    await expect(query({ sessionId: session.id })).resolves.toHaveLength(2);
  });

  it('distingue sessão inexistente de sessão sem voltas', async () => {
    const semSessao = createListSessionLapsQuery({
      sessions: reader({ findById: async () => null }),
    });
    const semVoltas = createListSessionLapsQuery({
      sessions: reader({ listLaps: async () => [] }),
    });

    await expect(semSessao({ sessionId: toSessionId('sumiu') })).rejects.toThrow(NotFoundError);
    await expect(semVoltas({ sessionId: session.id })).resolves.toEqual([]);
  });
});
