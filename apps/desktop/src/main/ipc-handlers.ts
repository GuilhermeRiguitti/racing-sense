import {
  toAnalysisReportDto,
  toComparisonDto,
  toLapDto,
  toSeriesDto,
  toSessionDto,
} from '@telemetry/contracts';
import { DomainError, toReferenceLapId, toSessionId } from '@telemetry/domain';
import type { Desktop } from './composition-root.js';
import { IPC, type IpcResult } from './ipc-contract.js';

/**
 * A borda do desktop.
 *
 * Mesma regra dos controllers HTTP: valida a entrada, chama **um** caso de uso,
 * devolve DTO. Regra de negócio aqui é erro de camada.
 *
 * `Error` não atravessa o IPC do Electron com a classe intacta, então o erro de
 * domínio vira `{ failed, code, message }` — o renderer trata pelo código, nunca
 * pela mensagem.
 */
type Invoker = (channel: string, handler: (payload: unknown) => Promise<unknown>) => void;

async function guard<T>(run: () => Promise<T>): Promise<IpcResult<T>> {
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

export function registerIpcHandlers(desktop: Desktop, handle: Invoker): void {
  const { useCases, identity } = desktop;

  // --- queries ---
  handle(IPC.listSessions, () =>
    guard(async () => (await useCases.listSessions()).map(toSessionDto)),
  );

  handle(IPC.listSessionLaps, (payload) =>
    guard(async () => {
      const { sessionId } = payload as { sessionId: string };
      return (await useCases.listSessionLaps({ sessionId: toSessionId(sessionId) })).map(toLapDto);
    }),
  );

  handle(IPC.getLapSeries, (payload) =>
    guard(async () => {
      const { sessionId, lapNumber } = payload as { sessionId: string; lapNumber: number };
      const series = await useCases.getLapSeries({
        sessionId: toSessionId(sessionId),
        lapNumber,
      });
      return series.map(toSeriesDto);
    }),
  );

  handle(IPC.listReferenceLaps, () =>
    guard(async () =>
      (await useCases.listReferenceLaps()).map((reference) => ({
        id: reference.id,
        label: reference.label,
        trackName: reference.track.name,
        carName: reference.car.name,
        lapNumber: reference.lap.number,
      })),
    ),
  );

  handle(IPC.compareLapToReference, (payload) =>
    guard(async () => {
      const { sessionId, lapNumber, referenceLapId } = payload as {
        sessionId: string;
        lapNumber: number;
        referenceLapId: string;
      };
      return toComparisonDto(
        await useCases.compareLapToReference({
          sessionId: toSessionId(sessionId),
          lapNumber,
          referenceLapId: toReferenceLapId(referenceLapId),
        }),
      );
    }),
  );

  handle(IPC.getLapAnalysis, (payload) =>
    guard(async () => {
      const { sessionId, lapNumber, referenceLapId } = payload as {
        sessionId: string;
        lapNumber: number;
        referenceLapId: string;
      };
      return toAnalysisReportDto(
        await useCases.getLapAnalysis({
          sessionId: toSessionId(sessionId),
          lapNumber,
          referenceLapId: toReferenceLapId(referenceLapId),
        }),
      );
    }),
  );

  handle(IPC.currentPilot, () => guard(() => identity.currentPilot()));

  // --- comandos ---
  handle(IPC.ingestTelemetryFile, (payload) =>
    guard(async () => {
      const { locator } = payload as { locator: string };
      return { sessionId: await useCases.ingestTelemetryFile({ locator }) };
    }),
  );

  handle(IPC.importReferenceLap, (payload) =>
    guard(async () => {
      const { sessionId, lapNumber, label } = payload as {
        sessionId: string;
        lapNumber: number;
        label: string;
      };
      return {
        referenceLapId: await useCases.importReferenceLap({
          sessionId: toSessionId(sessionId),
          lapNumber,
          label,
        }),
      };
    }),
  );

  handle(IPC.requestLapAnalysis, (payload) =>
    guard(async () => {
      const { sessionId, lapNumber, referenceLapId } = payload as {
        sessionId: string;
        lapNumber: number;
        referenceLapId: string;
      };
      await useCases.requestLapAnalysis({
        sessionId: toSessionId(sessionId),
        lapNumber,
        referenceLapId: toReferenceLapId(referenceLapId),
      });
      // Comando não devolve dado de leitura: o renderer busca com getLapAnalysis.
      return null;
    }),
  );

  handle(IPC.flushPublicationQueue, () => guard(() => useCases.flushPublicationQueue()));

  handle(IPC.signIn, (payload) =>
    guard(() => identity.signIn(payload as { email: string; password: string })),
  );

  handle(IPC.signOut, () => guard(() => identity.signOut()));
}
