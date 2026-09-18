import type { SessionReaderPort, SessionWriterPort } from '@telemetry/application-desktop';
import type { ChannelSeries, Lap, SessionId, TelemetrySession } from '@telemetry/domain';
import type { SqliteDatabase } from './database.js';
import {
  decodeLap,
  decodeSeries,
  decodeSession,
  encodeLap,
  encodeSeries,
  encodeSession,
} from './serialization.js';

/**
 * Armazenamento local das sessões do piloto, em SQLite.
 *
 * Passa a mesma suíte de contrato que o adapter em memória — é isso que permite
 * trocar um pelo outro sem nenhum caso de uso mudar.
 */
export function createSqliteSessionStore(
  db: SqliteDatabase,
): SessionReaderPort & SessionWriterPort {
  const statements = {
    upsertSession: db.prepare(
      `INSERT INTO sessions (id, payload, recorded_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, recorded_at = excluded.recorded_at`,
    ),
    deleteLaps: db.prepare('DELETE FROM laps WHERE session_id = ?'),
    deleteSeries: db.prepare('DELETE FROM lap_series WHERE session_id = ?'),
    insertLap: db.prepare('INSERT INTO laps (session_id, lap_number, payload) VALUES (?, ?, ?)'),
    insertSeries: db.prepare(
      'INSERT INTO lap_series (session_id, lap_number, payload) VALUES (?, ?, ?)',
    ),
    listSessions: db.prepare('SELECT payload FROM sessions ORDER BY created_at DESC'),
    findSession: db.prepare('SELECT payload FROM sessions WHERE id = ?'),
    listLaps: db.prepare('SELECT payload FROM laps WHERE session_id = ? ORDER BY lap_number'),
    readSeries: db.prepare(
      'SELECT payload FROM lap_series WHERE session_id = ? AND lap_number = ?',
    ),
    deleteSession: db.prepare('DELETE FROM sessions WHERE id = ?'),
  };

  /**
   * Gravar sessão, voltas e séries é uma transação só.
   *
   * Sem isso, uma queda no meio deixaria sessão sem volta — o tipo de estado que
   * depois aparece como "a sessão existe mas está vazia" e ninguém sabe por quê.
   */
  const saveAll = db.transaction(
    (input: {
      session: TelemetrySession;
      laps: readonly Lap[];
      seriesByLap: ReadonlyMap<number, readonly ChannelSeries[]>;
    }) => {
      statements.upsertSession.run(
        input.session.id,
        encodeSession(input.session),
        input.session.recordedAt?.toISOString() ?? null,
      );
      statements.deleteLaps.run(input.session.id);
      statements.deleteSeries.run(input.session.id);

      for (const lap of input.laps) {
        statements.insertLap.run(input.session.id, lap.number, encodeLap(lap));
      }
      for (const [lapNumber, series] of input.seriesByLap) {
        statements.insertSeries.run(input.session.id, lapNumber, encodeSeries(series));
      }
    },
  );

  return {
    async list() {
      return statements.listSessions
        .all()
        .map((row) => decodeSession((row as { payload: string }).payload));
    },

    async findById(id: SessionId) {
      const row = statements.findSession.get(id) as { payload: string } | undefined;
      return row === undefined ? null : decodeSession(row.payload);
    },

    async listLaps(id: SessionId) {
      return statements.listLaps
        .all(id)
        .map((row) => decodeLap((row as { payload: string }).payload));
    },

    async readLapSeries(id: SessionId, lapNumber: number) {
      const row = statements.readSeries.get(id, lapNumber) as { payload: string } | undefined;
      return row === undefined ? [] : decodeSeries(row.payload);
    },

    async save(input) {
      saveAll(input);
    },

    async delete(id: SessionId) {
      statements.deleteSession.run(id);
    },
  };
}
