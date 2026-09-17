import {
  compareToReference,
  type LapComparison,
  NotFoundError,
  type ReferenceLapId,
  type SessionId,
} from '@telemetry/domain';
import type { ReferenceLapReaderPort } from '../ports/reference-lap-store.port.js';
import type { SessionReaderPort } from '../ports/session-store.port.js';

export interface CompareLapToReferenceRequest {
  readonly sessionId: SessionId;
  readonly lapNumber: number;
  readonly referenceLapId: ReferenceLapId;
}

export interface CompareLapToReferenceDeps {
  readonly sessions: SessionReaderPort;
  readonly referenceLaps: ReferenceLapReaderPort;
}

export type CompareLapToReferenceQuery = (
  request: CompareLapToReferenceRequest,
) => Promise<LapComparison>;

/**
 * Delta da volta contra a referência.
 *
 * Query pura: calcula e devolve, não guarda nada. Se um dia o cálculo ficar caro
 * a ponto de precisar de cache, o cache entra como porta — não como escrita
 * escondida dentro da query.
 */
export function createCompareLapToReferenceQuery(
  deps: CompareLapToReferenceDeps,
): CompareLapToReferenceQuery {
  return async ({ sessionId, lapNumber, referenceLapId }) => {
    const [session, reference] = await Promise.all([
      deps.sessions.findById(sessionId),
      deps.referenceLaps.findById(referenceLapId),
    ]);
    if (session === null) {
      throw new NotFoundError(`Sessão ${sessionId} não encontrada`);
    }
    if (reference === null) {
      throw new NotFoundError(`Volta de referência ${referenceLapId} não encontrada`);
    }

    const laps = await deps.sessions.listLaps(sessionId);
    const lap = laps.find((candidate) => candidate.number === lapNumber);
    if (lap === undefined) {
      throw new NotFoundError(`Volta ${lapNumber} não existe na sessão ${sessionId}`);
    }

    return compareToReference(reference, {
      track: session.track,
      car: session.car,
      lap,
      series: await deps.sessions.readLapSeries(sessionId, lapNumber),
    });
  };
}
