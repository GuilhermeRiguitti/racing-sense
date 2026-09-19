import type { IdGeneratorPort } from '@telemetry/application';
import { InvalidRequestError } from '@telemetry/application';
import {
  isValidLap,
  NotFoundError,
  type ReferenceLap,
  type ReferenceLapId,
  type SessionId,
} from '@telemetry/domain';
import type { ReferenceLapWriterPort } from '../ports/reference-lap-store.port.js';
import type { SessionReaderPort } from '../ports/session-store.port.js';

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
    // Volta marcada continua visível e analisável; o que ela não pode é virar a
    // régua. Referência com corte de pista contamina toda comparação seguinte.
    if (!isValidLap(lap)) {
      const motivos = lap.flags.length > 0 ? lap.flags.join(', ') : 'sem tempo cronometrado';
      throw new InvalidRequestError(`Volta ${lapNumber} não serve de referência (${motivos})`);
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
