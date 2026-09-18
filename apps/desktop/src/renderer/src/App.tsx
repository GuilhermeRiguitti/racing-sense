import { useSessions } from './useSessions.js';

/**
 * Esqueleto da interface do piloto.
 *
 * O que está aqui já demonstra o mecanismo que importa: a lista se atualiza
 * sozinha quando uma sessão é ingerida, sem o piloto recarregar nada — ele está
 * com o aplicativo aberto enquanto treina (ADR 0017).
 *
 * O que falta: gráfico de canal, delta contra a referência e o relatório do
 * agente. É a etapa 4 do roadmap, e começa pela skill `dataviz`.
 */
export function App() {
  const { sessions, loading, error } = useSessions();

  return (
    <main>
      <h1>Telemetry Analysis</h1>

      {error !== null && <p role="alert">Não foi possível carregar as sessões: {error}</p>}

      {loading ? (
        <p>Carregando sessões…</p>
      ) : sessions.length === 0 ? (
        <p>
          Nenhuma sessão ainda. Arme a telemetria no sim com <kbd>Alt-L</kbd> e entre no carro — a
          sessão aparece aqui sozinha.
        </p>
      ) : (
        <ul>
          {sessions.map((session) => (
            <li key={session.id}>
              {session.trackName} · {session.carName} · {Math.round(session.durationSeconds)}s
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
