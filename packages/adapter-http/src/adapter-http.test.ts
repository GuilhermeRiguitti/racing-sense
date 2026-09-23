import type { SessionReaderPort } from '@telemetry/application-desktop';
import { toSessionId } from '@telemetry/domain';
import { aLap, aSeries, aSession } from '@telemetry/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import { createHttpCloudCatalog } from './cloud-catalog.http.js';
import { CloudRequestError, createHttpClient, type FetchLike } from './http-client.js';
import { createHttpIdentity } from './identity.http.js';
import { createHttpSessionPublisher } from './session-publisher.http.js';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const clientWith = (fetch: FetchLike) =>
  createHttpClient({ baseUrl: 'https://api.telemetria.test', fetch });

describe('createHttpClient', () => {
  it('traduz queda de rede em erro de domínio, para a fila poder tentar de novo', async () => {
    const http = clientWith(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(http.get('/qualquer')).rejects.toBeInstanceOf(CloudRequestError);
    await expect(http.get('/qualquer')).rejects.toMatchObject({ status: null });
  });

  it('carrega o status quando o servidor responde erro', async () => {
    const http = clientWith(async () => json({ error: 'nope' }, 403));

    await expect(http.get('/qualquer')).rejects.toMatchObject({ status: 403 });
  });
});

describe('createHttpIdentity', () => {
  it('devolve o piloto depois do login', async () => {
    const http = clientWith(async () =>
      json({ id: 'piloto-1', displayName: 'Ana', defaultVisibility: 'private' }),
    );

    const pilot = await createHttpIdentity(http).signIn({
      email: 'ana@exemplo.com',
      password: 'senha-bem-grande',
    });

    expect(pilot).toMatchObject({ displayName: 'Ana', defaultVisibility: 'private' });
  });

  it('401 em /auth/me significa deslogado, não falha', async () => {
    const http = clientWith(async () => json({ error: 'unauthorized' }, 401));

    await expect(createHttpIdentity(http).currentPilot()).resolves.toBeNull();
  });

  it('erro que não é 401 continua subindo', async () => {
    const http = clientWith(async () => json({ error: 'boom' }, 500));

    await expect(createHttpIdentity(http).currentPilot()).rejects.toBeInstanceOf(CloudRequestError);
  });
});

describe('createHttpSessionPublisher', () => {
  const session = aSession();
  const sessions: SessionReaderPort = {
    list: async () => [session],
    findById: async (id) => (id === session.id ? session : null),
    listLaps: async () => [aLap({ number: 3 })],
    readLapSeries: async () => [aSeries()],
  };

  it('envia sessão, voltas e séries num POST só', async () => {
    const fetch = vi.fn<FetchLike>(async () => new Response(null, { status: 204 }));

    await createHttpSessionPublisher(clientWith(fetch), sessions).publish(session.id);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://api.telemetria.test/sessions');
    const body = JSON.parse(String(init?.body));
    expect(body.laps).toHaveLength(1);
    expect(body.seriesByLap[0]).toMatchObject({ lapNumber: 3 });
    // As condições sobem junto: sem elas a comparação entre pilotos mente.
    expect(body.session.conditions.trackTempCelsius).toBe(session.conditions.trackTempCelsius);
  });

  it('não tenta publicar sessão que não existe localmente', async () => {
    const fetch = vi.fn<FetchLike>(async () => new Response(null, { status: 204 }));

    await expect(
      createHttpSessionPublisher(clientWith(fetch), sessions).publish(toSessionId('sumiu')),
    ).rejects.toThrow(/não existe localmente/);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('createHttpCloudCatalog', () => {
  it('converte o DTO da nuvem em modelo do domínio', async () => {
    const http = clientWith(async () =>
      json([
        {
          sessionId: 'session-1',
          ownerId: 'piloto-2',
          trackName: 'Spa',
          carName: 'Porsche 992',
          visibility: 'public',
          bestLapTimeSeconds: 135.2,
          lapCount: 12,
          recordedAt: '2026-09-17T12:00:00.000Z',
        },
      ]),
    );

    const [primeira] = await createHttpCloudCatalog(http).listPublicSessions({ limit: 10 });

    expect(primeira?.recordedAt).toBeInstanceOf(Date);
    expect(primeira?.trackName).toBe('Spa');
  });
});
