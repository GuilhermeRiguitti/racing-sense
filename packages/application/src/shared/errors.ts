import { DomainError } from '@telemetry/domain';

/**
 * Erros que nascem na orquestração, não no modelo.
 *
 * Herdam de `DomainError` para que a borda HTTP tenha um único lugar onde
 * traduzir erro em status — ver `apps/api`.
 */
export class MissingChannelError extends DomainError {
  override readonly name = 'MissingChannelError';
  readonly code = 'MISSING_CHANNEL';
}

/** O caso de uso recebeu entrada que não descreve nada existente. */
export class InvalidRequestError extends DomainError {
  override readonly name = 'InvalidRequestError';
  readonly code = 'INVALID_REQUEST';
}
