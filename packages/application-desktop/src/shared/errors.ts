import { DomainError } from '@telemetry/domain';

/**
 * Arquivo de telemetria sem um canal que o recorte de voltas exige.
 *
 * Mora aqui, e não no núcleo, porque canal de telemetria só existe no desktop —
 * a nuvem nunca lê arquivo do sim (ADR 0016).
 */
export class MissingChannelError extends DomainError {
  override readonly name = 'MissingChannelError';
  readonly code = 'MISSING_CHANNEL';
}
