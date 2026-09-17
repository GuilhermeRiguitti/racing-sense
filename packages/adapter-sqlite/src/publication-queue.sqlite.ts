import type { PublicationQueuePort } from '@telemetry/application';
import { type SessionId, toSessionId } from '@telemetry/domain';
import type { SqliteDatabase } from './database.js';

/**
 * Fila de publicação persistida.
 *
 * Sobrevive a fechar o aplicativo, a ficar sem internet e a reiniciar o Windows.
 * Sem persistir, "publica tudo automaticamente" perderia justamente as sessões
 * feitas offline — que são a maioria numa noite de treino com o roteador ruim.
 */
export function createSqlitePublicationQueue(db: SqliteDatabase): PublicationQueuePort {
  const statements = {
    enqueue: db.prepare(
      `INSERT INTO publication_queue (session_id) VALUES (?)
       ON CONFLICT(session_id) DO NOTHING`,
    ),
    pending: db.prepare(
      `SELECT session_id FROM publication_queue
       WHERE published_at IS NULL
       ORDER BY enqueued_at
       LIMIT ?`,
    ),
    markPublished: db.prepare(
      "UPDATE publication_queue SET published_at = datetime('now'), last_error = NULL WHERE session_id = ?",
    ),
    markFailed: db.prepare(
      'UPDATE publication_queue SET attempts = attempts + 1, last_error = ? WHERE session_id = ?',
    ),
  };

  return {
    async enqueue(sessionId: SessionId) {
      statements.enqueue.run(sessionId);
    },

    async pending(limit: number) {
      return statements.pending
        .all(limit)
        .map((row) => toSessionId((row as { session_id: string }).session_id));
    },

    async markPublished(sessionId: SessionId) {
      statements.markPublished.run(sessionId);
    },

    async markFailed(sessionId: SessionId, reason: string) {
      statements.markFailed.run(reason, sessionId);
    },
  };
}
