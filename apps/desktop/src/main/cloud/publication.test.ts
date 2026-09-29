import { describe, expect, it, vi } from 'vitest';
import { openLocalStore } from '../db/local-store.js';
import { CloudRequestError } from '../domain/errors.js';
import { toSessionId } from '../domain/id.js';
import { aLap, aSeries, aSession } from '../../../tests/support/builders.js';
import { call, createApiClient, type FetchLike } from './api-client.js';
import { currentPilot, signIn } from './auth.js';
import { buildPublication, flushPublicationQueue } from './publication.js';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** A api respondendo pelo `fetch` falso: o cliente gerado roda de verdade. */
function api(responder: (request: Request) => Response | Promise<Response>) {
  const fetch = vi.fn<FetchLike>(async (request) => responder(request));
  return { client: createApiClient({ baseUrl: 'http://api.test', fetch }), fetch };
}

function bancoComSessao(id: string) {
  const store = openLocalStore(':memory:');
  const session = aSession({ id: toSessionId(id) });
  store.saveRecording({
    session,
    laps: [
      aLap({ number: 1, flags: ['incomplete'], lapTimeSeconds: null }),
      aLap({ number: 2, lapTimeSeconds: 80.1 }),
      aLap({ number: 3, lapTimeSeconds: 79.4, flags: ['off-track'] }),
      aLap({ number: 4, lapTimeSeconds: 79.9 }),
    ],
    seriesByLap: new Map([[2, [aSeries()]]]),
  });
  store.recordIngestedFile(
    'C:\\Users\\piloto\\Documents\\iRacing\\telemetry\\sessao.ibt',
    session.id,
  );
  store.enqueuePublication(session.id);
  return store;
}

describe('call', () => {
  it('traduz queda de rede em erro de domínio, para a fila poder tentar de novo', async () => {
    const { client } = api(() => {
      throw new TypeError('fetch failed');
    });

    await expect(call('perfil', () => client.GET('/auth/me'))).rejects.toMatchObject({
      code: 'CLOUD_REQUEST_FAILED',
      status: null,
    });
  });

  it('carrega o status quando o servidor responde erro', async () => {
    const { client } = api(() => json(503, { message: 'fora do ar' }));

    await expect(call('perfil', () => client.GET('/auth/me'))).rejects.toMatchObject({
      status: 503,
    });
  });
});

describe('auth', () => {
  it('devolve o piloto depois do login, com o cookie a cargo do fetch', async () => {
    const piloto = { id: 'p1', displayName: 'Piloto', defaultVisibility: 'private' };
    const { client, fetch } = api(() => json(200, piloto));

    await expect(signIn(client, { email: 'a@b.com', password: '12345678' })).resolves.toEqual(
      piloto,
    );
    const pedido = fetch.mock.calls[0]?.[0];
    expect(pedido?.method).toBe('POST');
    expect(pedido?.credentials).toBe('include');
  });

  it('401 em /auth/me significa deslogado, não falha', async () => {
    const { client } = api(() => json(401, { message: 'Login necessário' }));

    await expect(currentPilot(client)).resolves.toBeNull();
  });

  it('erro que não é 401 continua subindo', async () => {
    const { client } = api(() => json(500, {}));

    await expect(currentPilot(client)).rejects.toBeInstanceOf(CloudRequestError);
  });
});

describe('buildPublication', () => {
  it('leva sessão, voltas e séries, e a melhor volta só entre as válidas', () => {
    const corpo = buildPublication(bancoComSessao('s1'), toSessionId('s1'));

    expect(corpo.id).toBe('s1');
    expect(corpo.laps.map((lap) => lap.number)).toEqual([1, 2, 3, 4]);
    expect(corpo.laps[1]?.series).toHaveLength(1);
    // 79,4 é mais rápida, mas saiu da pista (ADR 0018).
    expect(corpo.bestLapTimeSeconds).toBe(79.9);
  });

  it('nunca leva o caminho do arquivo: ele tem o nome de usuário do Windows', () => {
    const corpo = buildPublication(bancoComSessao('s1'), toSessionId('s1'));

    expect(JSON.stringify(corpo)).not.toContain('C:\\\\Users');
  });

  it('não tenta publicar sessão que não existe localmente', () => {
    expect(() => buildPublication(openLocalStore(':memory:'), toSessionId('sumiu'))).toThrow(
      /não existe localmente/,
    );
  });
});

describe('flushPublicationQueue', () => {
  it('publica o que está na fila, marca como enviado e avisa a tela', async () => {
    const store = bancoComSessao('s1');
    const { client, fetch } = api(() => new Response(null, { status: 204 }));
    const emit = vi.fn();

    const resultado = await flushPublicationQueue({ store, api: client, emit });

    expect(resultado).toEqual({ published: 1, failed: 0 });
    expect(fetch.mock.calls[0]?.[0].url).toBe('http://api.test/sessions');
    expect(store.pendingPublications(10)).toEqual([]);
    expect(emit).toHaveBeenCalledWith({ type: 'publication-progressed', published: 1, failed: 0 });
  });

  it('falha de rede não vira erro para quem chamou — a sessão fica na fila', async () => {
    const store = bancoComSessao('s1');
    const { client } = api(() => {
      throw new TypeError('ECONNREFUSED');
    });

    await expect(flushPublicationQueue({ store, api: client, emit: vi.fn() })).resolves.toEqual({
      published: 0,
      failed: 1,
    });
    expect(store.pendingPublications(10)).toEqual(['s1']);
  });

  it('uma sessão que falha não impede as outras de subir', async () => {
    const store = bancoComSessao('s1');
    store.saveRecording({
      session: aSession({ id: toSessionId('s2') }),
      laps: [],
      seriesByLap: new Map(),
    });
    store.enqueuePublication(toSessionId('s2'));
    const { client } = api(async (request) => {
      const corpo = (await request.json()) as { id: string };
      return corpo.id === 's1' ? json(500, {}) : new Response(null, { status: 204 });
    });

    const resultado = await flushPublicationQueue({ store, api: client, emit: vi.fn() });

    expect(resultado).toEqual({ published: 1, failed: 1 });
    expect(store.pendingPublications(10)).toEqual(['s1']);
  });

  it('rodada sem nada na fila não pisca nada na tela', async () => {
    const emit = vi.fn();
    const { client } = api(() => new Response(null, { status: 204 }));

    await flushPublicationQueue({ store: openLocalStore(':memory:'), api: client, emit });

    expect(emit).not.toHaveBeenCalled();
  });
});
