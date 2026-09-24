import type { LocalStore } from '../db/local-store.js';
import type { ChannelSeries } from '../domain/channel.js';
import { InvalidRequestError, NotFoundError } from '../domain/errors.js';
import type { SessionId } from '../domain/id.js';
import { isValidLap, type Lap } from '../domain/lap.js';
import type { TelemetrySession } from '../domain/session.js';

/** A sessão, ou `NotFoundError`. */
export function requireSession(store: LocalStore, sessionId: SessionId): TelemetrySession {
  const session = store.findSession(sessionId);
  if (session === null) {
    throw new NotFoundError(`Sessão ${sessionId} não encontrada`);
  }
  return session;
}

/** A volta da sessão, ou `NotFoundError`. Serve para volta válida ou não. */
export function requireLap(store: LocalStore, sessionId: SessionId, lapNumber: number): Lap {
  const lap = store.listLaps(sessionId).find((candidate) => candidate.number === lapNumber);
  if (lap === undefined) {
    throw new NotFoundError(`Volta ${lapNumber} não existe na sessão ${sessionId}`);
  }
  return lap;
}

/**
 * A volta, se ela é material de análise (ADR 0018).
 *
 * Volta marcada continua gravada e visível; o que ela não pode é entrar numa
 * comparação ou virar régua. Recusar é o erro que aparece; aceitar em silêncio
 * desloca todo delta seguinte sem avisar.
 */
export function requireValidLap(
  store: LocalStore,
  sessionId: SessionId,
  lapNumber: number,
  purpose: string,
): Lap {
  const lap = requireLap(store, sessionId, lapNumber);
  if (!isValidLap(lap)) {
    const motivos = lap.flags.length > 0 ? lap.flags.join(', ') : 'sem tempo cronometrado';
    throw new InvalidRequestError(`Volta ${lapNumber} ${purpose} (${motivos})`);
  }
  return lap;
}

/** As voltas da sessão, com a situação de cada uma. */
export function listSessionLaps(store: LocalStore, sessionId: SessionId): readonly Lap[] {
  requireSession(store, sessionId);
  return store.listLaps(sessionId);
}

/**
 * Os canais gravados de uma volta, como o arquivo entregou.
 *
 * Serve **qualquer** volta, válida ou não. Mostrar não é analisar: a volta com
 * corte de pista continua sendo o registro do que o piloto rodou, e é
 * justamente nela que ele quer ver onde saiu (ADR 0018).
 *
 * A série volta inteira, sem redução. Quem desenha sabe quantos pixels tem e
 * reduz para eles; decidir isso aqui seria escolher um número sem saber a tela.
 */
export function getLapSeries(
  store: LocalStore,
  sessionId: SessionId,
  lapNumber: number,
): readonly ChannelSeries[] {
  requireSession(store, sessionId);
  requireLap(store, sessionId, lapNumber);
  return store.readLapSeries(sessionId, lapNumber);
}
