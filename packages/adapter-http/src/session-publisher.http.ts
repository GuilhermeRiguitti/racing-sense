import type { SessionPublisherPort, SessionReaderPort } from '@telemetry/application-desktop';
import { type PublishSessionRequest, toLapDto, toSessionDto } from '@telemetry/contracts';
import { NotFoundError, type SessionId } from '@telemetry/domain';
import type { HttpClient } from './http-client.js';

/**
 * Envia uma sessão local para a nuvem.
 *
 * Lê do armazenamento local pela porta de leitura — nunca do disco direto — e
 * monta o corpo a partir dos DTOs de `@telemetry/contracts`, que são o contrato
 * compartilhado com a cloud-api e com a web.
 */
export function createHttpSessionPublisher(
  http: HttpClient,
  sessions: SessionReaderPort,
): SessionPublisherPort {
  return {
    async publish(sessionId: SessionId) {
      const session = await sessions.findById(sessionId);
      if (session === null) {
        throw new NotFoundError(`Sessão ${sessionId} não existe localmente`);
      }

      const laps = await sessions.listLaps(sessionId);
      const seriesByLap = await Promise.all(
        laps.map(async (lap) => ({
          lapNumber: lap.number,
          series: [...(await sessions.readLapSeries(sessionId, lap.number))].map((serie) => ({
            channel: serie.channel,
            unit: serie.unit,
            axis: serie.axis,
            x: [...serie.x],
            y: [...serie.y],
          })),
        })),
      );

      const body: PublishSessionRequest = {
        session: toSessionDto(session),
        laps: laps.map(toLapDto),
        seriesByLap,
      };

      await http.post('/sessions', body);
    },
  };
}
