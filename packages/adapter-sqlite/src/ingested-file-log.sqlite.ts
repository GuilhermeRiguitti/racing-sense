import type {
  IngestedFileLogReaderPort,
  IngestedFileLogWriterPort,
} from '@telemetry/application-desktop';
import { type SessionId, toSessionId } from '@telemetry/domain';
import type { SqliteDatabase } from './database.js';

/**
 * Quais arquivos já viraram sessão, na máquina deste piloto.
 *
 * Fica no mesmo banco das sessões e **nunca** é publicado: o caminho tem o nome
 * de usuário do Windows dentro.
 */
export function createSqliteIngestedFileLog(
  db: SqliteDatabase,
): IngestedFileLogReaderPort & IngestedFileLogWriterPort {
  const statements = {
    find: db.prepare('SELECT session_id FROM ingested_files WHERE locator = ?'),
    upsert: db.prepare(
      `INSERT INTO ingested_files (locator, session_id) VALUES (?, ?)
       ON CONFLICT(locator) DO UPDATE SET session_id = excluded.session_id`,
    ),
    forget: db.prepare('DELETE FROM ingested_files WHERE session_id = ?'),
  };

  return {
    async findSessionByLocator(locator: string) {
      const row = statements.find.get(locator) as { session_id: string } | undefined;
      return row === undefined ? null : toSessionId(row.session_id);
    },

    async record(locator: string, sessionId: SessionId) {
      statements.upsert.run(locator, sessionId);
    },

    async forgetSession(sessionId: SessionId) {
      statements.forget.run(sessionId);
    },
  };
}
