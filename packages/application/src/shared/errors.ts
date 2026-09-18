import { DomainError } from '@telemetry/domain';

/**
 * Erros que nascem na orquestração, não no modelo.
 *
 * Herdam de `DomainError` para que cada borda tenha um único lugar onde traduzir
 * erro em status — ver `apps/cloud-api` e os handlers de IPC do desktop.
 */
export class InvalidRequestError extends DomainError {
  override readonly name = 'InvalidRequestError';
  readonly code = 'INVALID_REQUEST';
}
