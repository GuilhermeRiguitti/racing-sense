import type {
  ReferenceLapReaderPort,
  ReferenceLapWriterPort,
} from '@telemetry/application-desktop';
import type { ReferenceLap, ReferenceLapId } from '@telemetry/domain';
import type { SqliteDatabase } from './database.js';
import { decodeReferenceLap, encodeReferenceLap } from './serialization.js';

export function createSqliteReferenceLapStore(
  db: SqliteDatabase,
): ReferenceLapReaderPort & ReferenceLapWriterPort {
  const statements = {
    upsert: db.prepare(
      `INSERT INTO reference_laps (id, payload) VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
    ),
    list: db.prepare('SELECT payload FROM reference_laps ORDER BY created_at DESC'),
    find: db.prepare('SELECT payload FROM reference_laps WHERE id = ?'),
    remove: db.prepare('DELETE FROM reference_laps WHERE id = ?'),
  };

  return {
    async list() {
      return statements.list
        .all()
        .map((row) => decodeReferenceLap((row as { payload: string }).payload));
    },

    async findById(id: ReferenceLapId) {
      const row = statements.find.get(id) as { payload: string } | undefined;
      return row === undefined ? null : decodeReferenceLap(row.payload);
    },

    async save(referenceLap: ReferenceLap) {
      statements.upsert.run(referenceLap.id, encodeReferenceLap(referenceLap));
    },

    async delete(id: ReferenceLapId) {
      statements.remove.run(id);
    },
  };
}
