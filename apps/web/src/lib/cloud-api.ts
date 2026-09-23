import {
  type PublishedSessionSummaryDto,
  publishedSessionSummaryDto,
  validate,
} from '@telemetry/contracts';

/**
 * Acesso à cloud-api a partir da web.
 *
 * A web **nunca** fala com a máquina do piloto nem monta caso de uso: ela só lê
 * a cloud-api, com o mesmo contrato que o app do Windows usa para publicar.
 * Por isso este app depende só de `@telemetry/contracts` — `pnpm arch` garante.
 *
 * As chamadas levam o cookie de sessão (`credentials: 'include'`), que é o mesmo
 * login do desktop (ADR 0014).
 */
const BASE_URL = process.env.NEXT_PUBLIC_CLOUD_API_URL ?? 'http://localhost:4000';

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    // Feed é conteúdo vivo: sem cache do Next entre requisições.
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`GET ${path} respondeu ${response.status}`);
  }
  return response.json();
}

export async function listPublicSessions(): Promise<readonly PublishedSessionSummaryDto[]> {
  const payload = await getJson('/sessions/public');
  if (!Array.isArray(payload)) {
    return [];
  }

  // Resposta fora do contrato é dado que não entra na tela: descartar um item
  // ruim é melhor que quebrar a página inteira.
  return payload.flatMap((item) => {
    const result = validate(publishedSessionSummaryDto, item);
    return result.ok ? [result.value] : [];
  });
}
