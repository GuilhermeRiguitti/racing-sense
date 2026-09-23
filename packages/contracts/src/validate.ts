import type { ZodType } from 'zod';

/**
 * Ponto único de validação do projeto.
 *
 * Existe para que **só este pacote** importe `zod`. Quem valida entrada — a
 * cloud-api, o desktop, a web — chama `validate` e recebe um resultado comum.
 * Trocar a lib de validação é reescrever este arquivo, e nada mais.
 */
export type Schema<T> = ZodType<T>;

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type Validated<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

export function validate<T>(schema: Schema<T>, value: unknown): Validated<T> {
  const result = schema.safeParse(value);
  if (result.success) {
    return { ok: true, value: result.data };
  }

  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}
