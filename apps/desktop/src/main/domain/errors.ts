/**
 * Erros do domínio.
 *
 * Regra: o domínio só lança erro **dele**. Erro de biblioteca (fs, zod, HTTP)
 * é traduzido por quem chama a lib, antes de subir. Assim quem orquestra não precisa saber
 * qual lib está por baixo para tratar falha.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
}

/** Uma invariante do modelo foi violada. Sempre bug de quem construiu o dado. */
export class InvariantError extends DomainError {
  override readonly name = 'InvariantError';
  readonly code = 'INVARIANT_VIOLATED';
}

/** A operação não faz sentido para estes dados — não é bug, é entrada inválida. */
export class IncompatibleReferenceError extends DomainError {
  override readonly name = 'IncompatibleReferenceError';
  readonly code = 'INCOMPATIBLE_REFERENCE';
}

/** O que foi pedido não existe. */
export class NotFoundError extends DomainError {
  override readonly name = 'NotFoundError';
  readonly code = 'NOT_FOUND';
}

/**
 * Ainda não implementado.
 *
 * Stub sempre lança isto com o que falta. Stub que devolve valor falso vira bug
 * silencioso — ver regra 22 do CLAUDE.md.
 */
export class NotImplementedError extends DomainError {
  override readonly name = 'NotImplementedError';
  readonly code = 'NOT_IMPLEMENTED';
}

/** O pedido não faz sentido para estes dados: volta inválida como referência, por exemplo. */
export class InvalidRequestError extends DomainError {
  override readonly name = 'InvalidRequestError';
  readonly code = 'INVALID_REQUEST';
}

/**
 * Arquivo de telemetria sem um canal que o recorte de voltas exige.
 *
 * A mensagem nomeia o canal: o catálogo vem do arquivo (regra 15), então o que
 * falta muda de carro para carro, e "canal faltando" sem nome não se investiga.
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

/**
 * Falha falando com a api.
 *
 * Sem rede é o estado normal de quem treina offline, não erro de programação:
 * a fila de publicação trata e tenta de novo depois.
 */
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
