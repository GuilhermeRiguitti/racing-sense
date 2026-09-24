import { notFound } from 'next/navigation';
import { findSession } from '../../../lib/api';

/**
 * Uma sessão publicada.
 *
 * Abre por link (`?share=...`) quando a sessão é não listada. O token vai para a
 * api, que aplica a regra de acesso — sessão privada e token revogado respondem
 * "não encontrada", nunca "sem permissão": distinguir os dois já entrega que a
 * sessão existe.
 */
export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ share?: string }>;
}) {
  const [{ sessionId }, { share }] = await Promise.all([params, searchParams]);
  const session = await findSession(sessionId, share);
  if (session === null) {
    notFound();
  }

  const { conditions } = session;

  return (
    <main>
      <h1>
        {session.trackName} · {session.carName}
      </h1>
      <p>
        {session.ownerName}
        {session.recordedAt === null
          ? ''
          : ` · ${new Date(session.recordedAt).toLocaleString('pt-BR')}`}
      </p>
      <p>
        Pista {conditions.trackTempCelsius ?? '—'} °C · ar {conditions.airTempCelsius ?? '—'} °C ·{' '}
        {conditions.skies ?? 'céu não informado'}
      </p>

      <table>
        <thead>
          <tr>
            <th>Volta</th>
            <th>Tempo</th>
            <th>Situação</th>
          </tr>
        </thead>
        <tbody>
          {session.laps.map((lap) => (
            <tr key={lap.number}>
              <td>{lap.number}</td>
              <td>{lap.lapTimeSeconds === null ? '—' : `${lap.lapTimeSeconds.toFixed(3)} s`}</td>
              <td>{lap.flags.length === 0 ? 'válida' : lap.flags.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
