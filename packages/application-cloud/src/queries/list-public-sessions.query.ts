import type { PublishedSessionSummary } from '@telemetry/domain';
import type { PublishedSessionReaderPort } from '../ports/published-session-store.port.js';

export interface ListPublicSessionsRequest {
  readonly trackId?: string;
  readonly carId?: string;
  readonly limit?: number;
}

export interface ListPublicSessionsDeps {
  readonly reader: PublishedSessionReaderPort;
}

/** Sessões públicas, para o feed e para procurar referência de outro piloto. */
export function createListPublicSessionsQuery(deps: ListPublicSessionsDeps) {
  return ({
    limit = 20,
    ...filter
  }: ListPublicSessionsRequest = {}): Promise<readonly PublishedSessionSummary[]> =>
    deps.reader.listPublic({ ...filter, limit });
}
