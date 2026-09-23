import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import { DomainError } from '@telemetry/domain';
import type { Response } from 'express';

/**
 * Traduz erro de domínio em status HTTP, num lugar só.
 *
 * O caso de uso lança o erro que faz sentido para ele; a borda decide o número.
 * Nenhum caso de uso conhece HTTP, e trocar Nest por outra coisa não espalha
 * mudança.
 *
 * `NOT_FOUND` cobre também "existe, mas você não pode ver" — distinguir 403 de
 * 404 entregaria ao curioso que a sessão existe.
 */
const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  NOT_FOUND: 404,
  INVALID_REQUEST: 400,
  INCOMPATIBLE_REFERENCE: 409,
  MISSING_CHANNEL: 422,
  CLOUD_REQUEST_FAILED: 502,
  INVARIANT_VIOLATED: 500,
  NOT_IMPLEMENTED: 501,
};

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainError) {
      const status = STATUS_BY_CODE[exception.code] ?? 500;
      response.status(status).json({ error: exception.code, message: exception.message });
      return;
    }

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    response.status(500).json({ error: 'INTERNAL', message: 'erro interno' });
  }
}
