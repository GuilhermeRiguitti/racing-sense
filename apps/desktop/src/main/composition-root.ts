import { join } from 'node:path';
import { createFileTelemetrySource } from '@telemetry/adapter-fs';
import {
  createHttpClient,
  createHttpCloudCatalog,
  createHttpIdentity,
  createHttpSessionPublisher,
  type FetchLike,
} from '@telemetry/adapter-http';
import { createIbtTelemetryDecoder } from '@telemetry/adapter-ibt';
import {
  createLlmNarrator,
  createUnavailableNarrator,
  loadLlmConfigFromEnv,
} from '@telemetry/adapter-llm';
import {
  createInMemoryAnalysisReportStore,
  createSequentialIdGenerator,
} from '@telemetry/adapter-memory';
import {
  createSqlitePublicationQueue,
  createSqliteReferenceLapStore,
  createSqliteSessionStore,
  openDatabase,
} from '@telemetry/adapter-sqlite';
import {
  createCompareLapToReferenceQuery,
  createFlushPublicationQueueHandler,
  createGetLapAnalysisQuery,
  createImportReferenceLapHandler,
  createIngestTelemetryFileHandler,
  createListReferenceLapsQuery,
  createListSessionLapsQuery,
  createListSessionsQuery,
  createRequestLapAnalysisHandler,
  type NarratorPort,
} from '@telemetry/application';

/**
 * Composition root do aplicativo do Windows.
 *
 * **Único arquivo do desktop que escolhe implementações.** Todo o resto recebe
 * portas. `pnpm arch` reprova import de adapter em qualquer outro lugar.
 *
 * Roda no processo principal do Electron — que é Node — e por isso pode abrir
 * arquivo, banco e, na fase 2, o addon nativo do SDK do iRacing.
 */
export interface DesktopEnvironment {
  /** Pasta de dados do app (`app.getPath('userData')` no Electron). */
  readonly userDataDir: string;
  /** Endereço da cloud-api. */
  readonly cloudBaseUrl: string;
  /**
   * `fetch` que carrega o cookie de sessão.
   *
   * No Electron é o `net.fetch` ligado à sessão da janela; em teste, um falso.
   */
  readonly fetch: FetchLike;
  readonly env: Record<string, string | undefined>;
}

function resolveNarrator(env: Record<string, string | undefined>): NarratorPort {
  try {
    return createLlmNarrator(loadLlmConfigFromEnv(env));
  } catch (error) {
    // Sem chave, o app abre igual: só a análise por modelo fica indisponível,
    // com motivo explícito quando alguém pedir.
    return createUnavailableNarrator(
      error instanceof Error ? error.message : 'configuração ausente',
    );
  }
}

export function buildDesktop(environment: DesktopEnvironment) {
  const db = openDatabase(join(environment.userDataDir, 'telemetry.db'));

  // Adapters locais: tudo funciona sem internet.
  const files = createFileTelemetrySource();
  const decoder = createIbtTelemetryDecoder(files);
  const sessions = createSqliteSessionStore(db);
  const referenceLaps = createSqliteReferenceLapStore(db);
  const publicationQueue = createSqlitePublicationQueue(db);
  const reports = createInMemoryAnalysisReportStore();
  const ids = createSequentialIdGenerator();
  const clock = { now: () => new Date() };
  const narrator = resolveNarrator(environment.env);

  // Adapters de nuvem: opcionais por definição. Se a rede cair, só estes falham.
  const http = createHttpClient({ baseUrl: environment.cloudBaseUrl, fetch: environment.fetch });
  const identity = createHttpIdentity(http);
  const publisher = createHttpSessionPublisher(http, sessions);
  const catalog = createHttpCloudCatalog(http);

  return {
    db,
    identity,
    catalog,
    useCases: {
      ingestTelemetryFile: createIngestTelemetryFileHandler({
        files,
        decoder,
        sessions,
        ids,
        publicationQueue,
      }),
      importReferenceLap: createImportReferenceLapHandler({ sessions, referenceLaps, ids }),
      requestLapAnalysis: createRequestLapAnalysisHandler({
        sessions,
        referenceLaps,
        reports,
        narrator,
        clock,
      }),
      flushPublicationQueue: createFlushPublicationQueueHandler({
        queue: publicationQueue,
        publisher,
      }),
      listSessions: createListSessionsQuery({ sessions }),
      listSessionLaps: createListSessionLapsQuery({ sessions }),
      listReferenceLaps: createListReferenceLapsQuery({ referenceLaps }),
      compareLapToReference: createCompareLapToReferenceQuery({ sessions, referenceLaps }),
      getLapAnalysis: createGetLapAnalysisQuery({ reports }),
    },
  };
}

export type Desktop = ReturnType<typeof buildDesktop>;
