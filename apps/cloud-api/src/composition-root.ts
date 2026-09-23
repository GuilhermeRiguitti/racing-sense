import { randomBytes } from 'node:crypto';
import { createInMemoryPublishedSessionStore } from '@telemetry/adapter-memory';
import { createPostgresPublishedSessionStore } from '@telemetry/adapter-postgres';
import {
  createListPublicSessionsQuery,
  createRevokeShareLinkHandler,
  createSetSessionVisibilityHandler,
  createShareSessionHandler,
  createViewPublishedSessionQuery,
  type PublishedSessionReaderPort,
  type PublishedSessionWriterPort,
  type ShareTokenGeneratorPort,
} from '@telemetry/application-cloud';
import { toShareToken } from '@telemetry/domain';

/**
 * Composition root da nuvem.
 *
 * **Único arquivo da cloud-api que escolhe implementações.** O Nest liga, não
 * pensa: os módulos recebem estes handlers prontos por `useFactory` e os
 * controllers só chamam — ver `docs/adr/0011-topologia-tres-aplicacoes.md`.
 *
 * Note o que **não** está aqui, e não pode estar (ADR 0016):
 *  - nada de `adapter-llm` — análise com modelo é do aplicativo do piloto;
 *  - nada de `adapter-ibt`, `adapter-fs` ou `ibt-core` — a nuvem não lê arquivo
 *    de telemetria nem fala com o SDK do iRacing;
 *  - nada de `@telemetry/application-desktop` — ela nem consegue nomear a
 *    ingestão, porque não declara o pacote.
 *
 * A nuvem recebe dado **já processado** pelo desktop, guarda e devolve.
 */
export interface CloudStores {
  readonly published: PublishedSessionReaderPort & PublishedSessionWriterPort;
}

/** Token de compartilhamento precisa ser imprevisível: 32 bytes de aleatório real. */
export function createRandomShareTokenGenerator(): ShareTokenGeneratorPort {
  return { next: () => toShareToken(randomBytes(32).toString('base64url')) };
}

export function buildCloudUseCases(stores: CloudStores) {
  const clock = { now: () => new Date() };
  const tokens = createRandomShareTokenGenerator();
  const { published } = stores;

  return {
    // comandos
    setSessionVisibility: createSetSessionVisibilityHandler({
      reader: published,
      writer: published,
    }),
    shareSession: createShareSessionHandler({
      reader: published,
      writer: published,
      tokens,
      clock,
    }),
    revokeShareLink: createRevokeShareLinkHandler({
      reader: published,
      writer: published,
      clock,
    }),
    // queries
    viewPublishedSession: createViewPublishedSessionQuery({ reader: published, clock }),
    listPublicSessions: createListPublicSessionsQuery({ reader: published }),
  };
}

export type CloudUseCases = ReturnType<typeof buildCloudUseCases>;

/**
 * Monta os adapters a partir do ambiente.
 *
 * Fica aqui, e não no módulo do Nest, porque escolher implementação é trabalho
 * de composition root. O módulo só chama esta função — é o que mantém o "Nest
 * liga, não pensa" verificável pelo `pnpm arch`.
 */
export function buildCloudUseCasesFromEnv(
  env: Record<string, string | undefined> = process.env,
): CloudUseCases {
  const connectionString = env.DATABASE_URL;

  // Sem banco configurado a API sobe em memória: dá para desenvolver a web sem
  // Postgres, e o adapter em memória passa a mesma suíte de contrato do que vai
  // para produção.
  const published =
    connectionString === undefined || connectionString === ''
      ? createInMemoryPublishedSessionStore()
      : createPostgresPublishedSessionStore({ connectionString });

  return buildCloudUseCases({ published });
}
