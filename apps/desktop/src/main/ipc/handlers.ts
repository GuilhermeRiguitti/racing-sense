import { IPC, type IpcResult } from '../../shared/ipc.js';
import { compareLapToReference } from '../analysis/compare-lap.js';
import { getLapSeries, listSessionLaps } from '../analysis/laps.js';
import { getReferenceLapSeries, importReferenceLap } from '../analysis/reference-laps.js';
import { getLapAnalysis, requestLapAnalysis } from '../analysis/request-lap-analysis.js';
import { getSessionStint } from '../analysis/stint.js';
import { currentPilot, signIn, signOut } from '../cloud/auth.js';
import { flushPublicationQueue } from '../cloud/publication.js';
import type { Desktop } from '../desktop.js';
import { DomainError } from '../domain/errors.js';
import { toReferenceLapId, toSessionId } from '../domain/id.js';
import { ingestTelemetryFile } from '../ingestion/ingest-file.js';
import {
  toAnalysisReportDto,
  toComparisonDto,
  toLapDto,
  toReferenceLapDto,
  toSeriesDto,
  toSessionDto,
  toStintLapDto,
} from './dto.js';

/**
 * A borda entre a tela e o resto do desktop.
 *
 * Lê a entrada, chama **uma** função, devolve DTO. Regra de corrida aqui é
 * sinal de que ela está no lugar errado.
 *
 * `Error` não atravessa o IPC do Electron com a classe intacta, então o erro de
 * domínio vira `{ failed, code, message }` — o renderer trata pelo código, nunca
 * pela mensagem.
 */
type Invoker = (channel: string, handler: (payload: unknown) => Promise<unknown>) => void;

async function guard<T>(run: () => T | Promise<T>): Promise<IpcResult<T>> {
  try {
    return { value: await run() };
  } catch (error) {
    if (error instanceof DomainError) {
      return { failed: true, code: error.code, message: error.message };
    }
    return {
      failed: true,
      code: 'INTERNAL',
      message: error instanceof Error ? error.message : 'erro desconhecido',
    };
  }
}

interface LapRequest {
  readonly sessionId: string;
  readonly lapNumber: number;
}

interface LapAgainstReferenceRequest extends LapRequest {
  readonly referenceLapId: string;
}

const lapAgainstReference = (payload: unknown) => {
  const { sessionId, lapNumber, referenceLapId } = payload as LapAgainstReferenceRequest;
  return {
    sessionId: toSessionId(sessionId),
    lapNumber,
    referenceLapId: toReferenceLapId(referenceLapId),
  };
};

export function registerIpcHandlers(desktop: Desktop, handle: Invoker): void {
  const { store, api, narrate, emit } = desktop;

  // --- leitura: tudo local, sem rede ---
  handle(IPC.listSessions, () => guard(() => store.listSessions().map(toSessionDto)));

  handle(IPC.listSessionLaps, (payload) =>
    guard(() => {
      const { sessionId } = payload as { sessionId: string };
      return listSessionLaps(store, toSessionId(sessionId)).map(toLapDto);
    }),
  );

  handle(IPC.getLapSeries, (payload) =>
    guard(() => {
      const { sessionId, lapNumber } = payload as LapRequest;
      return getLapSeries(store, toSessionId(sessionId), lapNumber).map(toSeriesDto);
    }),
  );

  handle(IPC.getSessionStint, (payload) =>
    guard(() => {
      const { sessionId } = payload as { sessionId: string };
      return getSessionStint(store, toSessionId(sessionId)).map(toStintLapDto);
    }),
  );

  handle(IPC.getReferenceLapSeries, (payload) =>
    guard(() => {
      const { referenceLapId } = payload as { referenceLapId: string };
      return getReferenceLapSeries(store, toReferenceLapId(referenceLapId)).map(toSeriesDto);
    }),
  );

  handle(IPC.listReferenceLaps, () =>
    guard(() => store.listReferenceLaps().map(toReferenceLapDto)),
  );

  handle(IPC.compareLapToReference, (payload) =>
    guard(() => toComparisonDto(compareLapToReference(store, lapAgainstReference(payload)))),
  );

  handle(IPC.getLapAnalysis, (payload) =>
    guard(() => toAnalysisReportDto(getLapAnalysis(store, lapAgainstReference(payload)))),
  );

  // --- escrita local ---
  handle(IPC.ingestTelemetryFile, (payload) =>
    guard(async () => {
      const { locator } = payload as { locator: string };
      return { sessionId: await ingestTelemetryFile({ store, emit }, locator) };
    }),
  );

  handle(IPC.importReferenceLap, (payload) =>
    guard(() => {
      const { sessionId, lapNumber, label } = payload as LapRequest & { label: string };
      return {
        referenceLapId: importReferenceLap(store, {
          sessionId: toSessionId(sessionId),
          lapNumber,
          label,
        }),
      };
    }),
  );

  handle(IPC.requestLapAnalysis, (payload) =>
    guard(async () => {
      await requestLapAnalysis({ store, narrate, emit }, lapAgainstReference(payload));
      // Gerar não devolve o relatório: o renderer busca com getLapAnalysis.
      return null;
    }),
  );

  // --- nuvem: opcional por definição ---
  handle(IPC.flushPublicationQueue, () => guard(() => flushPublicationQueue({ store, api, emit })));
  handle(IPC.currentPilot, () => guard(() => currentPilot(api)));
  handle(IPC.signIn, (payload) =>
    guard(() => signIn(api, payload as { email: string; password: string })),
  );
  handle(IPC.signOut, () => guard(() => signOut(api)));
}
