/**
 * Esquema das sessões publicadas, no servidor.
 *
 * Aqui o dono importa: tudo é por piloto, e a visibilidade é coluna, não
 * convenção. Consulta pública nunca pode depender de o `WHERE` estar certo em
 * cada lugar — por isso o acesso passa por `canView` no domínio e o índice
 * público é explícito.
 *
 * Migrations de verdade entram quando a cloud-api sair do esqueleto. Isto é a
 * forma pretendida, não o arquivo de migration.
 */
export const INTENDED_SCHEMA = `
CREATE TABLE pilots (
  id                  TEXT PRIMARY KEY,
  email               TEXT NOT NULL UNIQUE,
  display_name        TEXT NOT NULL,
  password_hash       TEXT NOT NULL,
  default_visibility  TEXT NOT NULL DEFAULT 'private',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE published_sessions (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  visibility    TEXT NOT NULL DEFAULT 'private',
  track_id      TEXT NOT NULL,
  car_id        TEXT NOT NULL,
  payload       JSONB NOT NULL,
  recorded_at   TIMESTAMPTZ,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON published_sessions (owner_id, published_at DESC);
CREATE INDEX ON published_sessions (visibility, track_id, car_id)
  WHERE visibility = 'public';

CREATE TABLE session_share_links (
  token         TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES published_sessions(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX ON session_share_links (session_id);
`;
