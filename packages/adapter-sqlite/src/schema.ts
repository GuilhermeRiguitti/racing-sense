/**
 * Esquema do banco local do piloto.
 *
 * Decisões deliberadas:
 *
 * - **Séries em JSON, não em linha por ponto.** Uma volta tem milhares de pontos
 *   por canal; uma linha por ponto viraria milhões de linhas para ganhar uma
 *   consulta que ninguém faz. O acesso é sempre "me dá a série inteira desta
 *   volta". Se um dia precisar de consulta por ponto, isso é outro esquema — e
 *   outro ADR.
 * - **`ON DELETE CASCADE`.** Apagar sessão apaga voltas e séries. Estado meio
 *   apagado é pior que nada.
 * - **A fila de publicação mora aqui.** Ela precisa sobreviver a reinício, que é
 *   justamente o que faz "publica tudo automaticamente" não perder o que
 *   aconteceu offline.
 * - **`ingested_files` guarda caminho de arquivo, e por isso nunca é publicado.**
 *   O caminho tem o nome de usuário do Windows dentro. Ele serve só para o
 *   watcher não reprocessar, a cada abertura, tudo que já está na pasta.
 */
export const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  payload       TEXT NOT NULL,
  recorded_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS laps (
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  lap_number    INTEGER NOT NULL,
  payload       TEXT NOT NULL,
  PRIMARY KEY (session_id, lap_number)
);

CREATE TABLE IF NOT EXISTS lap_series (
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  lap_number    INTEGER NOT NULL,
  -- BLOB, não TEXT: as séries são números, e em JSON ocupavam seis vezes mais.
  payload       BLOB NOT NULL,
  PRIMARY KEY (session_id, lap_number)
);

CREATE TABLE IF NOT EXISTS reference_laps (
  id            TEXT PRIMARY KEY,
  payload       TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS publication_queue (
  session_id    TEXT PRIMARY KEY,
  enqueued_at   TEXT NOT NULL DEFAULT (datetime('now')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  published_at  TEXT
);

CREATE TABLE IF NOT EXISTS ingested_files (
  locator       TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  ingested_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ingested_files_session
  ON ingested_files (session_id);

CREATE INDEX IF NOT EXISTS idx_publication_pending
  ON publication_queue (published_at, enqueued_at);
`;
