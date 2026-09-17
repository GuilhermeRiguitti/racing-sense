/**
 * Erros do domínio.
 *
 * Regra: o domínio só lança erro **dele**. Erro de biblioteca (fs, zod, HTTP)
 * é traduzido no adapter antes de subir. Assim o caso de uso não precisa saber
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
 * silencioso — ver regra 9 do CLAUDE.md.
 */
export class NotImplementedError extends DomainError {
  override readonly name = 'NotImplementedError';
  readonly code = 'NOT_IMPLEMENTED';
}
