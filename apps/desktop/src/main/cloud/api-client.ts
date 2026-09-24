import createClient, { type Client } from 'openapi-fetch';
import { CloudRequestError } from '../domain/errors.js';
import type { components, paths } from './api-schema.js';

/**
 * Cliente da api, tipado pelo contrato OpenAPI que ela publica.
 *
 * `api-schema.d.ts` é gerado — não edite à mão. Quando a api mudar:
 * `pnpm api:types` na raiz exporta o `openapi.json` e regenera este arquivo.
 *
 * A api só entra no que é social: login e publicação. Nada do coach — ingerir,
 * comparar, narrar — passa por aqui (regra 10).
 */
export type ApiClient = Client<paths>;
export type ApiSchemas = components['schemas'];

/**
 * `fetch` injetado.
 *
 * No Electron as chamadas saem pelo `fetch` da sessão do Chromium, que guarda e
 * reenvia o cookie selado do login. Em teste, entra um falso.
 */
export type FetchLike = (request: Request) => Promise<Response>;

export function createApiClient({
  baseUrl,
  fetch,
}: {
  baseUrl: string;
  fetch: FetchLike;
}): ApiClient {
  return createClient<paths>({ baseUrl, fetch, credentials: 'include' });
}

/**
 * Executa uma chamada e devolve o corpo, ou lança `CloudRequestError`.
 *
 * Sem rede não é erro de programação: é o estado normal de quem treina offline.
 * Vira erro de domínio para quem chamou decidir — a fila de publicação tenta de
 * novo depois.
 */
export async function call<T>(
  label: string,
  run: () => Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: Awaited<ReturnType<typeof run>>;
  try {
    result = await run();
  } catch (error) {
    throw new CloudRequestError(
      `${label}: ${error instanceof Error ? error.message : 'falha de rede'}`,
      null,
    );
  }
  if (!result.response.ok) {
    throw new CloudRequestError(
      `${label} respondeu ${result.response.status}`,
      result.response.status,
    );
  }
  return result.data as T;
}
