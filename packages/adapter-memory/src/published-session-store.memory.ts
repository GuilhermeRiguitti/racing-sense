import type {
  PublishedSessionReaderPort,
  PublishedSessionWriterPort,
} from '@telemetry/application-cloud';
import type {
  PilotId,
  PublishedSession,
  PublishedSessionSummary,
  SessionId,
  ShareLink,
  ShareToken,
  Visibility,
} from '@telemetry/domain';
import { isValidLap } from '@telemetry/domain';

const toSummary = (published: PublishedSession): PublishedSessionSummary => ({
  sessionId: published.session.id,
  ownerId: published.ownerId,
  trackName: published.session.track.name,
  carName: published.session.car.name,
  visibility: published.visibility,
  bestLapTimeSeconds: published.laps.reduce<number | null>((best, lap) => {
    if (!isValidLap(lap) || lap.lapTimeSeconds === null) return best;
    return best === null ? lap.lapTimeSeconds : Math.min(best, lap.lapTimeSeconds);
  }, null),
  lapCount: published.laps.length,
  recordedAt: published.session.recordedAt,
});

/**
 * Sessões publicadas em memória.
 *
 * Deixa a cloud-api subir sem Postgres, para desenvolver a web. Passa a mesma
 * suíte de contrato que o adapter de Postgres vai ter que passar.
 */
export function createInMemoryPublishedSessionStore(): PublishedSessionReaderPort &
  PublishedSessionWriterPort {
  const stored = new Map<string, PublishedSession>();

  return {
    async findById(id: SessionId) {
      return stored.get(id) ?? null;
    },

    async listByOwner(ownerId: PilotId) {
      return [...stored.values()]
        .filter((published) => published.ownerId === ownerId)
        .map(toSummary);
    },

    async listPublic(filter) {
      return [...stored.values()]
        .filter((published) => published.visibility === 'public')
        .filter(
          (published) =>
            filter.trackId === undefined || published.session.track.id === filter.trackId,
        )
        .filter(
          (published) => filter.carId === undefined || published.session.car.id === filter.carId,
        )
        .slice(0, filter.limit)
        .map(toSummary);
    },

    async findByShareToken(token: ShareToken) {
      return (
        [...stored.values()].find((published) =>
          published.shareLinks.some((link) => link.token === token),
        ) ?? null
      );
    },

    async save(published: PublishedSession) {
      stored.set(published.session.id, published);
    },

    async setVisibility(id: SessionId, visibility: Visibility) {
      const published = stored.get(id);
      if (published !== undefined) {
        stored.set(id, { ...published, visibility });
      }
    },

    async addShareLink(id: SessionId, link: ShareLink) {
      const published = stored.get(id);
      if (published !== undefined) {
        stored.set(id, { ...published, shareLinks: [...published.shareLinks, link] });
      }
    },

    async revokeShareLink(id: SessionId, token: ShareToken, revokedAt: Date) {
      const published = stored.get(id);
      if (published !== undefined) {
        stored.set(id, {
          ...published,
          shareLinks: published.shareLinks.map((link) =>
            link.token === token ? { ...link, revokedAt } : link,
          ),
        });
      }
    },
  };
}
