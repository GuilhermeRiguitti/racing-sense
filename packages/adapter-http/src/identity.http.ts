import type { IdentityPort } from '@telemetry/application-desktop';
import { pilotDto } from '@telemetry/contracts';
import { type Pilot, toPilotId } from '@telemetry/domain';
import type { HttpClient } from './http-client.js';
import { CloudRequestError } from './http-client.js';

const toPilot = (payload: unknown): Pilot => {
  const dto = pilotDto.parse(payload);
  return {
    id: toPilotId(dto.id),
    displayName: dto.displayName,
    defaultVisibility: dto.defaultVisibility,
  };
};

/**
 * Identidade contra a cloud-api.
 *
 * O cookie de sessão é gerido pelo `fetch` injetado — este arquivo nunca toca em
 * `Set-Cookie`, header ou token. Trocar iron-session por outro esquema não muda
 * nada aqui, desde que o servidor continue respondendo o perfil do piloto.
 */
export function createHttpIdentity(http: HttpClient): IdentityPort {
  return {
    async signIn(credentials) {
      return toPilot(await http.post('/auth/session', credentials));
    },

    async signOut() {
      await http.delete('/auth/session');
    },

    async currentPilot() {
      try {
        return toPilot(await http.get('/auth/me'));
      } catch (error) {
        // Não logado é resposta esperada, não falha: o app abre offline do mesmo
        // jeito e só esconde o que depende da nuvem.
        if (error instanceof CloudRequestError && error.status === 401) {
          return null;
        }
        throw error;
      }
    },
  };
}
