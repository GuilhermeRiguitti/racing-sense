import type { SessionReaderPort, SessionWriterPort } from '@telemetry/application';
import type { ChannelSeries, Lap, SessionId, TelemetrySession } from '@telemetry/domain';

interface StoredSession {
  session: TelemetrySession;
  laps: readonly Lap[];
  seriesByLap: ReadonlyMap<number, readonly ChannelSeries[]>;
}

/**
 * Armazenamento de sessões em memória.
 *
 * Existe para teste e para rodar o sistema antes de a persistência em disco ficar
 * pronta. Cumpre o mesmo contrato do adapter de disco — ver
 * `session-store.memory.test.ts`, que roda a suíte de contrato da porta.
 */
export function createInMemorySessionStore(): SessionReaderPort & SessionWriterPort {
  const stored = new Map<string, StoredSession>();

  return {
    async list() {
      return [...stored.values()].map((entry) => entry.session);
    },

    async findById(id: SessionId) {
      return stored.get(id)?.session ?? null;
    },

    async listLaps(id: SessionId) {
      return stored.get(id)?.laps ?? [];
    },

    async readLapSeries(id: SessionId, lapNumber: number) {
      return stored.get(id)?.seriesByLap.get(lapNumber) ?? [];
    },

    async save({ session, laps, seriesByLap }) {
      stored.set(session.id, { session, laps, seriesByLap });
    },

    async delete(id: SessionId) {
      stored.delete(id);
    },
  };
}
