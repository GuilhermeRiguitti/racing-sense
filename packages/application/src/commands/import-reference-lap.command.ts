import {
  NotFoundError,
  type ReferenceLap,
  type ReferenceLapId,
  type SessionId,
} from '@telemetry/domain';
import type { ReferenceLapWriterPort } from '../ports/reference-lap-store.port.js';
import type { SessionReaderPort } from '../ports/session-store.port.js';
import type { IdGeneratorPort } from '../ports/system.port.js';
import { InvalidRequestError } from '../shared/errors.js';

export interface ImportReferenceLapCommand {
  /** Sessão já ingerida de onde a volta sai. */
  readonly sessionId: SessionId;
  readonly lapNumber: number;
  readonly label: string;
}

export interface ImportReferenceLapDeps {
  readonly sessions: SessionReaderPort;
  readonly referenceLaps: ReferenceLapWriterPort;
  readonly ids: IdGeneratorPort;
}

export type ImportReferenceLapHandler = (
  command: ImportReferenceLapCommand,
) => Promise<ReferenceLapId>;

/**
 * Promove uma volta de uma sessão ingerida a volta de referência.
 *
 * Importar um `.ibt` só para extrair a referência é este comando precedido de
 * `IngestTelemetryFile` — não existe caminho paralelo de leitura de arquivo.
 */
export function createImportReferenceLapHandler(
  deps: ImportReferenceLapDeps,
): ImportReferenceLapHandler {
  return async ({ sessionId, lapNumber, label }) => {
    const session = await deps.sessions.findById(sessionId);
    if (session === null) {
      throw new NotFoundError(`Sessão ${sessionId} não encontrada`);
    }

    const laps = await deps.sessions.listLaps(sessionId);
    const lap = laps.find((candidate) => candidate.number === lapNumber);
    if (lap === undefined) {
      throw new NotFoundError(`Volta ${lapNumber} não existe na sessão ${sessionId}`);
    }
    if (!lap.isComplete) {
      throw new InvalidRequestError(
        `Volta ${lapNumber} está incompleta (out lap, in lap ou gravação cortada) e não serve de referência`,
      );
    }

    const referenceLap: ReferenceLap = {
      id: deps.ids.nextReferenceLapId(),
      label,
      origin: 'session-lap',
      track: session.track,
      car: session.car,
      lap,
      series: await deps.sessions.readLapSeries(sessionId, lapNumber),
    };

    await deps.referenceLaps.save(referenceLap);
    return referenceLap.id;
  };
}
