import type { LocalStore } from '../db/local-store.js';
import type { SessionId } from '../domain/id.js';
import type { Lap } from '../domain/lap.js';
import { type ChannelSummary, summarizeLap } from '../domain/lap-summary.js';
import { requireSession } from './laps.js';

/** Uma volta da sessão e o resumo de cada canal gravado nela. */
export interface StintLap {
  readonly lap: Lap;
  readonly channels: readonly ChannelSummary[];
}

/**
 * A sessão volta a volta: é a visão do engenheiro no muro dos boxes.
 *
 * Como a pressão subiu ao longo do stint, quanto combustível cada volta
 * gastou, em que volta o piloto mexeu no balanço de freio. Toda volta entra,
 * válida ou não: a volta com saída de pista também esquentou o pneu e gastou
 * combustível, e tirá-la daqui deixaria um buraco na evolução.
 *
 * Só lê. O resumo é calculado na hora, a partir da amostra gravada — não existe
 * cópia resumida no banco para ficar diferente da série que a originou.
 */
export function getSessionStint(store: LocalStore, sessionId: SessionId): readonly StintLap[] {
  requireSession(store, sessionId);
  return store.listLaps(sessionId).map((lap) => ({
    lap,
    channels: summarizeLap(store.readLapSeries(sessionId, lap.number)),
  }));
}
