import type { TelemetrySession } from '@telemetry/domain';
import type { SessionReaderPort } from '../ports/session-store.port.js';

export interface ListSessionsDeps {
  readonly sessions: SessionReaderPort;
}

export type ListSessionsQuery = () => Promise<readonly TelemetrySession[]>;

/** Lista as sessões ingeridas. Recebe só o leitor: não tem como escrever. */
export function createListSessionsQuery(deps: ListSessionsDeps): ListSessionsQuery {
  return () => deps.sessions.list();
}
