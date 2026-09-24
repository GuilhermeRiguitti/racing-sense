import type { LocalStore } from '../db/local-store.js';
import { type ReferenceLapId, type SessionId, toReferenceLapId } from '../domain/id.js';
import type { ReferenceLap } from '../domain/reference-lap.js';
import { requireSession, requireValidLap } from './laps.js';

export interface ImportReferenceLapRequest {
  /** Sessão já ingerida de onde a volta sai. */
  readonly sessionId: SessionId;
  readonly lapNumber: number;
  readonly label: string;
}

/**
 * Promove uma volta de uma sessão ingerida a volta de referência.
 *
 * Importar um `.ibt` só para extrair a referência é esta função precedida da
 * ingestão — não existe caminho paralelo de leitura de arquivo.
 */
export function importReferenceLap(
  store: LocalStore,
  { sessionId, lapNumber, label }: ImportReferenceLapRequest,
): ReferenceLapId {
  const session = requireSession(store, sessionId);
  // Referência com corte de pista contamina toda comparação seguinte.
  const lap = requireValidLap(store, sessionId, lapNumber, 'não serve de referência');

  const referenceLap: ReferenceLap = {
    id: toReferenceLapId(crypto.randomUUID()),
    label,
    origin: 'session-lap',
    track: session.track,
    car: session.car,
    lap,
    series: store.readLapSeries(sessionId, lapNumber),
  };

  store.saveReferenceLap(referenceLap);
  return referenceLap.id;
}
