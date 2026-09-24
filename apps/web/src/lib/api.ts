import createClient from 'openapi-fetch';
import type { components, paths } from './api-schema';

/**
 * Acesso à api a partir da web.
 *
 * A web **nunca** fala com a máquina do piloto: ela só lê a api, com os tipos
 * gerados do contrato OpenAPI que a api publica (`api-schema.d.ts` — não edite
 * à mão; rode `pnpm api:types` na raiz quando a api mudar).
 *
 * Quem decide quem vê o quê é a api. A web não filtra visibilidade por conta
 * própria — regra de acesso duplicada é como vaza dado privado.
 */
export type ApiSchemas = components['schemas'];
export type PublishedSessionSummary = ApiSchemas['PublishedSessionSummaryDto'];
export type PublishedSession = ApiSchemas['PublishedSessionDto'];

const api = createClient<paths>({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  // Feed é conteúdo vivo: sem cache do Next entre requisições.
  cache: 'no-store',
});

export async function listPublicSessions(): Promise<PublishedSessionSummary[]> {
  const { data, response } = await api.GET('/sessions/public');
  if (!response.ok || data === undefined) {
    throw new Error(`GET /sessions/public respondeu ${response.status}`);
  }
  return data;
}

/** As sessões do piloto que este visitante pode ver. A api aplica a regra. */
export async function listPilotSessions(pilotId: string): Promise<PublishedSessionSummary[]> {
  const { data, response } = await api.GET('/pilots/{pilotId}/sessions', {
    params: { path: { pilotId } },
  });
  if (!response.ok || data === undefined) {
    throw new Error(`GET /pilots/${pilotId}/sessions respondeu ${response.status}`);
  }
  return data;
}

/**
 * Uma sessão, ou `null` quando não existe **ou** este visitante não pode ver.
 *
 * A api responde 404 nos dois casos, de propósito: distinguir entregaria que a
 * sessão existe.
 */
export async function findSession(
  sessionId: string,
  shareToken: string | undefined,
): Promise<PublishedSession | null> {
  const { data, response } = await api.GET('/sessions/{sessionId}', {
    params: {
      path: { sessionId },
      query: shareToken === undefined ? {} : { shareToken },
    },
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok || data === undefined) {
    throw new Error(`GET /sessions/${sessionId} respondeu ${response.status}`);
  }
  return data;
}
