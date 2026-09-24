import { listPilotSessions } from '../../../lib/api';

/**
 * Perfil do piloto: as sessões dele que este visitante pode ver.
 *
 * Quem decide o que aparece é a api — o dono vê tudo, os outros só o público.
 * A web nunca filtra visibilidade por conta própria.
 */
export default async function PilotProfile({ params }: { params: Promise<{ pilotId: string }> }) {
  const { pilotId } = await params;
  const sessions = await listPilotSessions(pilotId).catch(() => []);

  return (
    <main>
      <h1>{sessions[0]?.ownerName ?? 'Perfil do piloto'}</h1>

      {sessions.length === 0 ? (
        <p>Nenhuma sessão visível.</p>
      ) : (
        <ul>
          {sessions.map((session) => (
            <li key={session.sessionId}>
              <a href={`/sessions/${session.sessionId}`}>
                {session.trackName} · {session.carName}
              </a>{' '}
              · {session.lapCount} voltas
              {session.bestLapTimeSeconds === null
                ? ''
                : ` · melhor volta ${session.bestLapTimeSeconds.toFixed(3)} s`}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
