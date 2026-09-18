import { join } from 'node:path';
import {
  createFileTelemetrySource,
  createFileTelemetryWatcher,
  telemetryDirectory,
} from '@telemetry/adapter-fs';
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
  createSqliteIngestedFileLog,
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
  type EventPublisherPort,
  type NarratorPort,
} from '@telemetry/application-desktop';

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
   * A pasta Documentos do usuário.
   *
   * Vem de fora porque quem sabe resolvê-la no Windows — inclusive quando está
   * redirecionada para o OneDrive — é o Electron. Onde o iRacing grava dentro
   * dela é assunto do adapter, e quem junta as duas pontas é este arquivo.
   */
  readonly documentsDirectory: string;
  /** Sobrescreve a pasta observada. Útil em desenvolvimento e em teste. */
  readonly telemetryDirectoryOverride?: string | undefined;
  /**
   * `fetch` que carrega o cookie de sessão.
   *
   * No Electron é o `net.fetch` ligado à sessão da janela; em teste, um falso.
   */
  readonly fetch: FetchLike;
  readonly env: Record<string, string | undefined>;
  /**
   * Para onde vão os avisos de "mudou alguma coisa".
   *
   * Entra pelo ambiente porque quem sabe empurrar para a tela é o Electron, e o
   * composition root não deve importar `BrowserWindow`.
   */
  readonly events: EventPublisherPort;
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
  const ingestedFiles = createSqliteIngestedFileLog(db);
  const reports = createInMemoryAnalysisReportStore();
  const ids = createSequentialIdGenerator();
  const clock = { now: () => new Date() };
  const narrator = resolveNarrator(environment.env);
  const events = environment.events;

  // Adapters de nuvem: opcionais por definição. Se a rede cair, só estes falham.
  // Observa a pasta do sim. Só diz *quando* um arquivo pode ser lido — quem
  // decodifica é o adapter do `.ibt`.
  const watcher = createFileTelemetryWatcher({
    directory:
      environment.telemetryDirectoryOverride ?? telemetryDirectory(environment.documentsDirectory),
  });

  const http = createHttpClient({ baseUrl: environment.cloudBaseUrl, fetch: environment.fetch });
  const identity = createHttpIdentity(http);
  const publisher = createHttpSessionPublisher(http, sessions);
  const catalog = createHttpCloudCatalog(http);

  return {
    db,
    identity,
    catalog,
    watcher,
    useCases: {
      ingestTelemetryFile: createIngestTelemetryFileHandler({
        files,
        decoder,
        sessions,
        ids,
        publicationQueue,
        events,
        ingestedFiles,
      }),
      importReferenceLap: createImportReferenceLapHandler({ sessions, referenceLaps, ids }),
      requestLapAnalysis: createRequestLapAnalysisHandler({
        sessions,
        referenceLaps,
        reports,
        narrator,
        clock,
        events,
      }),
      flushPublicationQueue: createFlushPublicationQueueHandler({
        queue: publicationQueue,
        publisher,
        events,
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
