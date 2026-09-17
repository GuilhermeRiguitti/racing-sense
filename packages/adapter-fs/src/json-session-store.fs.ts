import type { SessionReaderPort, SessionWriterPort } from '@telemetry/application';
import { NotImplementedError } from '@telemetry/domain';

/**
 * Persistência de sessões em disco.
 *
 * Reparsear o `.ibt` a cada visualização é desperdício conhecido; o derivado por
 * volta é o que fica gravado. Formato ainda em aberto — ver ADR 0007.
 *
 * Quando existir, roda a mesma suíte de contrato que o adapter em memória
 * (`@telemetry/application/testing`). Passar nela é a condição para substituir.
 */
export function createJsonSessionStore(_directory: string): SessionReaderPort & SessionWriterPort {
  throw new NotImplementedError(
    'Persistência de sessão em disco depende do formato definido no ADR 0007',
  );
}
