import { DomainError } from '@telemetry/domain';

/**
 * `fetch` injetado.
 *
 * Por que não usar o global: no Electron, as chamadas saem pelo `net.fetch`
 * ligado à sessão do app, que é quem guarda e reenvia o cookie selado do login.
 * Em teste, entra um `fetch` falso. Nos dois casos, este pacote não sabe a
 * diferença — e é por isso que ele é testável sem rede.
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
  readonly baseUrl: string;
  readonly fetch: FetchLike;
}

/** Falha vinda da nuvem, já traduzida para o vocabulário do domínio. */
export class CloudRequestError extends DomainError {
  override readonly name = 'CloudRequestError';
  readonly code = 'CLOUD_REQUEST_FAILED';

  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }
}

export function createHttpClient({ baseUrl, fetch }: HttpClientOptions) {
  const request = async (path: string, init: RequestInit = {}): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', ...init.headers },
        // Sem o cookie, toda chamada autenticada volta 401.
        credentials: 'include',
      });
    } catch (error) {
      // Sem rede não é erro de programação: é o estado normal de quem treina
      // offline. Vira erro de domínio para a fila poder tratar e tentar depois.
      throw new CloudRequestError(error instanceof Error ? error.message : 'falha de rede', null);
    }

    if (!response.ok) {
      throw new CloudRequestError(
        `${init.method ?? 'GET'} ${path} respondeu ${response.status}`,
        response.status,
      );
    }

    return response.status === 204 ? null : response.json();
  };

  return {
    get: (path: string) => request(path),
    post: (path: string, body?: unknown) =>
      request(
        path,
        body === undefined ? { method: 'POST' } : { method: 'POST', body: JSON.stringify(body) },
      ),
    patch: (path: string, body: unknown) =>
      request(path, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (path: string) => request(path, { method: 'DELETE' }),
  };
}

export type HttpClient = ReturnType<typeof createHttpClient>;
