import type { PilotDto } from '../../shared/dto.js';
import { CloudRequestError } from '../domain/errors.js';
import { type ApiClient, call } from './api-client.js';

/**
 * Login contra a api.
 *
 * O cookie de sessão é gerido pelo `fetch` injetado — este arquivo nunca toca em
 * `Set-Cookie`, header ou token.
 */
export function signIn(
  api: ApiClient,
  credentials: { email: string; password: string },
): Promise<PilotDto> {
  return call('login', () => api.POST('/auth/session', { body: credentials }));
}

export async function signOut(api: ApiClient): Promise<void> {
  await call('logout', () => api.DELETE('/auth/session'));
}

/** Quem está logado, ou `null`. Não logado é resposta esperada, não falha. */
export async function currentPilot(api: ApiClient): Promise<PilotDto | null> {
  try {
    return await call('perfil', () => api.GET('/auth/me'));
  } catch (error) {
    // O app abre offline do mesmo jeito e só esconde o que depende da nuvem.
    if (error instanceof CloudRequestError && error.status === 401) {
      return null;
    }
    throw error;
  }
}
