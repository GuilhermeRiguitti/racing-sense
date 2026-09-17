import { createFileTelemetrySource } from '@telemetry/adapter-fs';
import { createIbtTelemetryDecoder } from '@telemetry/adapter-ibt';
import {
  createLlmNarrator,
  createUnavailableNarrator,
  loadLlmConfigFromEnv,
} from '@telemetry/adapter-llm';
import {
  createInMemoryAnalysisReportStore,
  createInMemoryReferenceLapStore,
  createInMemorySessionStore,
  createSequentialIdGenerator,
} from '@telemetry/adapter-memory';
import type { NarratorPort } from '@telemetry/application';
import {
  type CompareLapToReferenceQuery,
  createCompareLapToReferenceQuery,
  createGetLapAnalysisQuery,
  createImportReferenceLapHandler,
  createIngestTelemetryFileHandler,
  createListReferenceLapsQuery,
  createListSessionLapsQuery,
  createListSessionsQuery,
  createRequestLapAnalysisHandler,
  type GetLapAnalysisQuery,
  type ImportReferenceLapHandler,
  type IngestTelemetryFileHandler,
  type ListReferenceLapsQuery,
  type ListSessionLapsQuery,
  type ListSessionsQuery,
  type RequestLapAnalysisHandler,
} from '@telemetry/application';

/**
 * Composition root.
 *
 * **Este é o único arquivo do sistema que escolhe implementações.** Todo o resto
 * recebe portas. Trocar armazenamento em memória por disco, ou Gemini por outro
 * provedor, é mudar aqui — e só aqui.
 *
 * Se um `import` de adapter aparecer em qualquer outro arquivo fora de
 * `apps/api/src/composition-root.ts`, `pnpm arch` reprova.
 */
export interface UseCases {
  readonly ingestTelemetryFile: IngestTelemetryFileHandler;
  readonly importReferenceLap: ImportReferenceLapHandler;
  readonly requestLapAnalysis: RequestLapAnalysisHandler;
  readonly listSessions: ListSessionsQuery;
  readonly listSessionLaps: ListSessionLapsQuery;
  readonly listReferenceLaps: ListReferenceLapsQuery;
  readonly compareLapToReference: CompareLapToReferenceQuery;
  readonly getLapAnalysis: GetLapAnalysisQuery;
}

function resolveNarrator(env: Record<string, string | undefined>): NarratorPort {
  try {
    return createLlmNarrator(loadLlmConfigFromEnv(env));
  } catch (error) {
    // Sem chave configurada a aplicação sobe assim mesmo: só a narração fica
    // indisponível, e o motivo aparece quando alguém pedir análise.
    return createUnavailableNarrator(
      error instanceof Error ? error.message : 'configuração ausente',
    );
  }
}

export function buildUseCases(env: Record<string, string | undefined> = process.env): UseCases {
  // Adapters. Persistência ainda em memória — o adapter de disco depende do
  // formato definido no ADR 0007 e roda a mesma suíte de contrato.
  const files = createFileTelemetrySource();
  const decoder = createIbtTelemetryDecoder(files);
  const sessions = createInMemorySessionStore();
  const referenceLaps = createInMemoryReferenceLapStore();
  const reports = createInMemoryAnalysisReportStore();
  const ids = createSequentialIdGenerator();
  const clock = { now: () => new Date() };
  const narrator = resolveNarrator(env);

  return {
    ingestTelemetryFile: createIngestTelemetryFileHandler({ files, decoder, sessions, ids }),
    importReferenceLap: createImportReferenceLapHandler({ sessions, referenceLaps, ids }),
    requestLapAnalysis: createRequestLapAnalysisHandler({
      sessions,
      referenceLaps,
      reports,
      narrator,
      clock,
    }),
    listSessions: createListSessionsQuery({ sessions }),
    listSessionLaps: createListSessionLapsQuery({ sessions }),
    listReferenceLaps: createListReferenceLapsQuery({ referenceLaps }),
    compareLapToReference: createCompareLapToReferenceQuery({ sessions, referenceLaps }),
    getLapAnalysis: createGetLapAnalysisQuery({ reports }),
  };
}
