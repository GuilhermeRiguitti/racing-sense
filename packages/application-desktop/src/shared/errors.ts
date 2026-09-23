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

/**
 * O arquivo tem duas voltas diferentes com o mesmo número.
 *
 * Acontece quando o contador de voltas do sim reinicia no meio da gravação. O
 * recorte já separa as duas corretamente; o que falta é um jeito de guardá-las,
 * porque a volta é identificada pelo número. Qual jeito é o certo depende do
 * motivo do reinício — por isso a mensagem traz as sessões do sim que o arquivo
 * atravessa (`SessionNum`), em vez de o código presumir uma.
 */
export class RepeatedLapNumberError extends DomainError {
  override readonly name = 'RepeatedLapNumberError';
  readonly code = 'REPEATED_LAP_NUMBER';
}
