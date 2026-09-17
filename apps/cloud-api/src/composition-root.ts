import { randomBytes } from 'node:crypto';
import { createInMemoryAnalysisReportStore } from '@telemetry/adapter-memory';
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
} from '@telemetry/application';
import { toShareToken } from '@telemetry/domain';

/**
 * Composition root da nuvem.
 *
 * **Único arquivo da cloud-api que escolhe implementações.** O Nest liga, não
 * pensa: os módulos recebem estes handlers prontos por `useFactory` e os
 * controllers só chamam — ver `docs/adr/0011-topologia-tres-aplicacoes.md`.
 *
 * Note o que **não** está aqui: nada de `adapter-llm`. Análise com modelo é do
 * aplicativo do piloto, e `pnpm arch` reprova se alguém tentar trazer para cá.
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
  const published = createPostgresPublishedSessionStore({
    connectionString: env.DATABASE_URL ?? '',
  });
  return buildCloudUseCases({ published });
}

/** Relatórios ficam em memória por enquanto: a nuvem não gera análise (ADR 0011). */
export const analysisReportsAreDesktopOnly = createInMemoryAnalysisReportStore;
