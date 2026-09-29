import type { LocalStore } from '../db/local-store.js';
import { NotFoundError } from '../domain/errors.js';
import type { ReferenceLapId, SessionId } from '../domain/id.js';
import { compareToReference, type LapComparison } from '../domain/lap-comparison.js';
import type { ReferenceLap } from '../domain/reference-lap.js';
import { requireSession, requireValidLap } from './laps.js';

export interface LapAgainstReference {
  readonly sessionId: SessionId;
  readonly lapNumber: number;
  readonly referenceLapId: ReferenceLapId;
}

export function requireReferenceLap(store: LocalStore, id: ReferenceLapId): ReferenceLap {
  const reference = store.findReferenceLap(id);
  if (reference === null) {
    throw new NotFoundError(`Volta de referência ${id} não encontrada`);
  }
  return reference;
}

/**
 * Delta da volta contra a referência.
 *
 * Só lê e calcula, não guarda nada. O cálculo é do domínio; o narrador, quando
 * entra, recebe este resultado pronto (regra 17).
 */
export function compareLapToReference(
  store: LocalStore,
  { sessionId, lapNumber, referenceLapId }: LapAgainstReference,
): LapComparison {
  const session = requireSession(store, sessionId);
  const reference = requireReferenceLap(store, referenceLapId);
  const lap = requireValidLap(store, sessionId, lapNumber, 'não é válida');

  return compareToReference(reference, {
    track: session.track,
    car: session.car,
    lap,
    series: store.readLapSeries(sessionId, lapNumber),
    sectorStartPcts: session.sectorStartPcts,
  });
}
