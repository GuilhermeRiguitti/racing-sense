import type { CloudCatalogPort } from '@telemetry/application';
import { publishedSessionSummaryDto } from '@telemetry/contracts';
import { type PublishedSessionSummary, toPilotId, toSessionId } from '@telemetry/domain';
import { z } from 'zod';
import type { HttpClient } from './http-client.js';

const listSchema = z.array(publishedSessionSummaryDto);

/** Catálogo de sessões públicas de outros pilotos. */
export function createHttpCloudCatalog(http: HttpClient): CloudCatalogPort {
  return {
    async listPublicSessions(filter) {
      const params = new URLSearchParams({ limit: String(filter.limit) });
      if (filter.trackId !== undefined) params.set('trackId', filter.trackId);
      if (filter.carId !== undefined) params.set('carId', filter.carId);

      const payload = listSchema.parse(await http.get(`/sessions/public?${params}`));

      return payload.map(
        (dto): PublishedSessionSummary => ({
          sessionId: toSessionId(dto.sessionId),
          ownerId: toPilotId(dto.ownerId),
          trackName: dto.trackName,
          carName: dto.carName,
          visibility: dto.visibility,
          bestLapTimeSeconds: dto.bestLapTimeSeconds,
          lapCount: dto.lapCount,
          recordedAt: dto.recordedAt === null ? null : new Date(dto.recordedAt),
        }),
      );
    },
  };
}
