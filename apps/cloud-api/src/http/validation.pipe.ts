import { BadRequestException } from '@nestjs/common';
import { type Schema, validate } from '@telemetry/contracts';

/**
 * Validação de entrada com os schemas de `@telemetry/contracts`.
 *
 * O mesmo schema que o desktop usa para montar o corpo é o que a API usa para
 * conferir — contrato único, não duas declarações que divergem com o tempo. Por
 * isso não usamos `class-validator`: ele obrigaria a redeclarar tudo.
 *
 * E `zod` não aparece aqui: quem conhece a lib de validação é o `contracts`.
 */
export function parseBody<T>(schema: Schema<T>, value: unknown): T {
  const result = validate(schema, value);
  if (!result.ok) {
    throw new BadRequestException({ error: 'INVALID_REQUEST', issues: result.issues });
  }
  return result.value;
}
