import Database from 'better-sqlite3';
import type { ChannelSeries } from '../domain/channel.js';
import { type ReferenceLapId, type SessionId, toSessionId } from '../domain/id.js';
import type { AnalysisReport } from '../domain/insight.js';
import type { Lap } from '../domain/lap.js';
import type { ReferenceLap } from '../domain/reference-lap.js';
import type { TelemetrySession } from '../domain/session.js';
import { SCHEMA } from './schema.js';
import {
  decodeAnalysisReport,
  decodeLap,
  decodeReferenceLap,
  decodeSeries,
  decodeSession,
  encodeAnalysisReport,
  encodeLap,
  encodeReferenceLap,
  encodeSeries,
  encodeSession,
} from './serialization.js';

export interface AnalysisReportKey {
  readonly sessionId: SessionId;
  readonly lapNumber: number;
  readonly referenceLapId: ReferenceLapId;
}

export interface SessionRecording {
  readonly session: TelemetrySession;
  readonly laps: readonly Lap[];
  readonly seriesByLap: ReadonlyMap<number, readonly ChannelSeries[]>;
}

/**
 * O banco local do piloto: um arquivo SQLite na pasta de dados do app.
 *
 * Tudo que o coach mostra sai daqui, sem rede. Os métodos são síncronos porque o
 * `better-sqlite3` é: numa leitura local de milissegundos, `await` só
 * acrescentaria cerimônia.
 *
 * `:memory:` serve aos testes — o mesmo SQLite, sem arquivo.
 */
export function openLocalStore(file: string) {
  const db = new Database(file);
  db.exec(SCHEMA);

  const sql = {
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

    upsertReference: db.prepare(
      `INSERT INTO reference_laps (id, payload) VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
    ),
    listReferences: db.prepare('SELECT payload FROM reference_laps ORDER BY created_at DESC'),
    findReference: db.prepare('SELECT payload FROM reference_laps WHERE id = ?'),
    deleteReference: db.prepare('DELETE FROM reference_laps WHERE id = ?'),

    upsertReport: db.prepare(
      `INSERT INTO analysis_reports (session_id, lap_number, reference_lap_id, payload)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(session_id, lap_number, reference_lap_id) DO UPDATE SET payload = excluded.payload`,
    ),
    findReport: db.prepare(
      `SELECT payload FROM analysis_reports
       WHERE session_id = ? AND lap_number = ? AND reference_lap_id = ?`,
    ),

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

    findIngested: db.prepare('SELECT session_id FROM ingested_files WHERE locator = ?'),
    upsertIngested: db.prepare(
      `INSERT INTO ingested_files (locator, session_id) VALUES (?, ?)
       ON CONFLICT(locator) DO UPDATE SET session_id = excluded.session_id`,
    ),
    forgetIngested: db.prepare('DELETE FROM ingested_files WHERE session_id = ?'),
  };

  /**
   * Gravar sessão, voltas e séries é uma transação só.
   *
   * Sem isso, uma queda no meio deixaria sessão sem volta — o tipo de estado que
   * depois aparece como "a sessão existe mas está vazia" e ninguém sabe por quê.
   * Gravar de novo a mesma sessão substitui voltas e séries, sem duplicar.
   */
  const saveRecording = db.transaction(({ session, laps, seriesByLap }: SessionRecording) => {
    sql.upsertSession.run(
      session.id,
      encodeSession(session),
      session.recordedAt?.toISOString() ?? null,
    );
    sql.deleteLaps.run(session.id);
    sql.deleteSeries.run(session.id);

    for (const lap of laps) {
      sql.insertLap.run(session.id, lap.number, encodeLap(lap));
    }
    for (const [lapNumber, series] of seriesByLap) {
      sql.insertSeries.run(session.id, lapNumber, encodeSeries(series));
    }
  });

  /**
   * Apagar sessão apaga também o registro do arquivo de origem, para ele poder
   * ser ingerido de novo. Voltas, séries e relatórios vão por `ON DELETE CASCADE`.
   */
  const deleteSession = db.transaction((id: SessionId) => {
    sql.deleteSession.run(id);
    sql.forgetIngested.run(id);
  });

  return {
    close: () => db.close(),

    // --- sessões ---
    saveRecording: (recording: SessionRecording): void => saveRecording(recording),
    deleteSession: (id: SessionId): void => deleteSession(id),
    listSessions: (): TelemetrySession[] =>
      sql.listSessions.all().map((row) => decodeSession((row as { payload: string }).payload)),
    findSession(id: SessionId): TelemetrySession | null {
      const row = sql.findSession.get(id) as { payload: string } | undefined;
      return row === undefined ? null : decodeSession(row.payload);
    },
    listLaps: (id: SessionId): Lap[] =>
      sql.listLaps.all(id).map((row) => decodeLap((row as { payload: string }).payload)),
    /** A amostra como o arquivo entregou (ADR 0019). Volta sem série devolve vazio. */
    readLapSeries(id: SessionId, lapNumber: number): readonly ChannelSeries[] {
      const row = sql.readSeries.get(id, lapNumber) as { payload: Uint8Array } | undefined;
      return row === undefined ? [] : decodeSeries(row.payload);
    },

    // --- voltas de referência ---
    saveReferenceLap(reference: ReferenceLap): void {
      sql.upsertReference.run(reference.id, encodeReferenceLap(reference));
    },
    listReferenceLaps: (): ReferenceLap[] =>
      sql.listReferences
        .all()
        .map((row) => decodeReferenceLap((row as { payload: string }).payload)),
    findReferenceLap(id: ReferenceLapId): ReferenceLap | null {
      const row = sql.findReference.get(id) as { payload: string } | undefined;
      return row === undefined ? null : decodeReferenceLap(row.payload);
    },
    deleteReferenceLap(id: ReferenceLapId): void {
      sql.deleteReference.run(id);
    },

    // --- relatórios do narrador ---
    saveAnalysisReport(report: AnalysisReport): void {
      sql.upsertReport.run(
        report.sessionId,
        report.lapNumber,
        report.referenceLapId,
        encodeAnalysisReport(report),
      );
    },
    findAnalysisReport(key: AnalysisReportKey): AnalysisReport | null {
      const row = sql.findReport.get(key.sessionId, key.lapNumber, key.referenceLapId) as
        | { payload: string }
        | undefined;
      return row === undefined ? null : decodeAnalysisReport(row.payload);
    },

    // --- fila de publicação ---
    /**
     * Sobrevive a fechar o aplicativo, a ficar sem internet e a reiniciar o
     * Windows. Sem persistir, "publica tudo automaticamente" perderia justamente
     * as sessões feitas offline.
     */
    enqueuePublication(id: SessionId): void {
      sql.enqueue.run(id);
    },
    /** Próximas sessões a tentar, mais antigas primeiro. */
    pendingPublications: (limit: number): SessionId[] =>
      sql.pending.all(limit).map((row) => toSessionId((row as { session_id: string }).session_id)),
    markPublished(id: SessionId): void {
      sql.markPublished.run(id);
    },
    /** A sessão continua na fila: a próxima rodada tenta de novo. */
    markPublicationFailed(id: SessionId, reason: string): void {
      sql.markFailed.run(reason, id);
    },

    // --- arquivos já ingeridos ---
    /**
     * Qual sessão veio deste arquivo, ou `null`.
     *
     * O caminho tem o nome de usuário do Windows dentro, e por isso este registro
     * **nunca** é publicado. Ele existe só para o watcher não reprocessar, a cada
     * abertura do app, tudo que já está na pasta.
     */
    findSessionByLocator(locator: string): SessionId | null {
      const row = sql.findIngested.get(locator) as { session_id: string } | undefined;
      return row === undefined ? null : toSessionId(row.session_id);
    },
    recordIngestedFile(locator: string, id: SessionId): void {
      sql.upsertIngested.run(locator, id);
    },
  };
}

export type LocalStore = ReturnType<typeof openLocalStore>;
