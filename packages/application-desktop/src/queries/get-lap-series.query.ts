import { type ChannelSeries, NotFoundError, type SessionId } from '@telemetry/domain';
import type { SessionReaderPort } from '../ports/session-store.port.js';

export interface GetLapSeriesRequest {
  readonly sessionId: SessionId;
  readonly lapNumber: number;
}

export interface GetLapSeriesDeps {
  readonly sessions: SessionReaderPort;
}

export type GetLapSeriesQuery = (request: GetLapSeriesRequest) => Promise<readonly ChannelSeries[]>;

/**
 * Os canais gravados de uma volta, como o arquivo entregou.
 *
 * Serve **qualquer** volta, válida ou não. Mostrar não é analisar: a volta com
 * corte de pista continua sendo o registro do que o piloto rodou, e é
 * justamente nela que ele quer ver onde saiu (ADR 0018). O que é recusado para
 * volta inválida é comparar e eleger referência — não olhar.
 *
 * A série volta inteira, sem redução. Quem desenha sabe quantos pixels tem e
 * reduz para eles; decidir isso aqui seria escolher um número sem saber a tela.
 */
export function createGetLapSeriesQuery(deps: GetLapSeriesDeps): GetLapSeriesQuery {
  return async ({ sessionId, lapNumber }) => {
    const session = await deps.sessions.findById(sessionId);
    if (session === null) {
      throw new NotFoundError(`Sessão ${sessionId} não encontrada`);
    }
    const laps = await deps.sessions.listLaps(sessionId);
    if (!laps.some((lap) => lap.number === lapNumber)) {
      throw new NotFoundError(`Volta ${lapNumber} não existe na sessão ${sessionId}`);
    }
    return deps.sessions.readLapSeries(sessionId, lapNumber);
  };
}
