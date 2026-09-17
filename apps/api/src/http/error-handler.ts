import { DomainError } from '@telemetry/domain';
import type { Context } from 'hono';

/**
 * Traduz erro de domínio em status HTTP, num lugar só.
 *
 * O caso de uso lança o erro que faz sentido para ele; é a borda que decide o
 * número. Assim nenhum caso de uso precisa conhecer HTTP — e trocar Hono por
 * outro framework não espalha mudança.
 */
const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  NOT_FOUND: 404,
  INVALID_REQUEST: 400,
  INCOMPATIBLE_REFERENCE: 409,
  MISSING_CHANNEL: 422,
  INVARIANT_VIOLATED: 500,
  NOT_IMPLEMENTED: 501,
};

export function toErrorResponse(error: unknown, c: Context): Response {
  if (error instanceof DomainError) {
    const status = STATUS_BY_CODE[error.code] ?? 500;
    return c.json({ error: error.code, message: error.message }, status as 400);
  }

  const message = error instanceof Error ? error.message : 'erro desconhecido';
  return c.json({ error: 'INTERNAL', message }, 500);
}
