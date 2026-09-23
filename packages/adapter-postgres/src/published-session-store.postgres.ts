import type {
  PublishedSessionReaderPort,
  PublishedSessionWriterPort,
} from '@telemetry/application-cloud';
import { NotImplementedError } from '@telemetry/domain';

/**
 * Armazenamento das sessões publicadas, em Postgres.
 *
 * Esqueleto. Quando for implementado, roda a suíte de contrato da porta — a
 * mesma que o adapter em memória e o de SQLite já rodam. Enquanto não houver
 * Postgres no CI, a suíte fica marcada como pendente em `docs/pendencias.md`.
 */
export interface PostgresOptions {
  readonly connectionString: string;
}

export function createPostgresPublishedSessionStore(
  _options: PostgresOptions,
): PublishedSessionReaderPort & PublishedSessionWriterPort {
  throw new NotImplementedError(
    'Store em Postgres ainda não implementado; o esquema pretendido está em schema.sql.ts',
  );
}
