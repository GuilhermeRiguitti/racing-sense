import { listPublicSessions } from '../lib/api';

/**
 * Feed público: as sessões que outros pilotos abriram.
 *
 * Renderizado no servidor — é aqui que o Next se paga: conteúdo público,
 * multiusuário, com link que precisa abrir rápido e ser indexável.
 */
export default async function Home() {
  const sessions = await listPublicSessions().catch(() => []);

  return (
    <main>
      <h1>Telemetry Analysis</h1>
      <p>Sessões públicas da comunidade.</p>

      {sessions.length === 0 ? (
        <p>Nenhuma sessão pública ainda.</p>
      ) : (
        <ul>
          {sessions.map((session) => (
            <li key={session.sessionId}>
              <a href={`/sessions/${session.sessionId}`}>
                {session.trackName} · {session.carName}
              </a>{' '}
              · {session.lapCount} voltas ·{' '}
              <a href={`/pilots/${session.ownerId}`}>{session.ownerName}</a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
