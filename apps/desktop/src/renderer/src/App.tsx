import type { LapDto } from '@telemetry/contracts';
import { useEffect, useState } from 'react';
import { bridge } from './bridge.js';
import { formatLapTime } from './chart-math.js';
import { LapTable } from './LapTable.js';
import { SessionHeader } from './SessionHeader.js';
import { SessionList } from './SessionList.js';
import { TraceChart } from './TraceChart.js';
import { useBridgeQuery } from './useBridgeQuery.js';
import { useSessions } from './useSessions.js';

/**
 * A tela do piloto: sessões, voltas e a volta escolhida ao longo da pista.
 *
 * Abre já na sessão mais recente e na volta mais útil dela, porque o caso de
 * uso é "acabei de sair do carro": ninguém quer clicar três vezes para ver a
 * volta que acabou de dar.
 */
export function App() {
  const { sessions, loading, error } = useSessions();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lapNumber, setLapNumber] = useState<number | null>(null);

  // Sessão nova ingerida vira a escolhida: é a que o piloto acabou de rodar.
  useEffect(() => {
    const maisRecente = [...sessions].sort((a, b) =>
      (b.recordedAt ?? '').localeCompare(a.recordedAt ?? ''),
    )[0];
    if (
      maisRecente !== undefined &&
      (sessionId === null || !sessions.some((s) => s.id === sessionId))
    ) {
      setSessionId(maisRecente.id);
    }
  }, [sessions, sessionId]);

  const laps = useBridgeQuery(sessionId, () => bridge().listSessionLaps(sessionId ?? ''));

  useEffect(() => {
    if (laps.data === null) return;
    if (lapNumber !== null && laps.data.some((lap) => lap.number === lapNumber)) return;
    setLapNumber(voltaInicial(laps.data)?.number ?? null);
  }, [laps.data, lapNumber]);

  const series = useBridgeQuery(
    sessionId !== null && lapNumber !== null ? `${sessionId}#${lapNumber}` : null,
    () => bridge().getLapSeries(sessionId ?? '', lapNumber ?? 0),
  );

  const session = sessions.find((s) => s.id === sessionId) ?? null;
  const lap = laps.data?.find((l) => l.number === lapNumber) ?? null;

  return (
    <div className="app">
      <aside className="app__sidebar">
        {loading ? (
          <p className="muted">Carregando sessões…</p>
        ) : (
          <SessionList
            sessions={sessions}
            selected={sessionId}
            onSelect={(id) => {
              setSessionId(id);
              setLapNumber(null);
            }}
          />
        )}
      </aside>

      <main className="app__main">
        {error !== null && (
          <p role="alert" className="alert">
            Não foi possível carregar as sessões: {error}
          </p>
        )}

        {!loading && sessions.length === 0 && (
          <div className="empty">
            <h1>Nenhuma sessão ainda</h1>
            <p>
              Arme a telemetria no sim com <kbd>Alt-L</kbd> e entre no carro. Quando você sair, a
              sessão aparece aqui sozinha.
            </p>
          </div>
        )}

        {session !== null && (
          <>
            <SessionHeader session={session} />

            {laps.error !== null && (
              <p role="alert" className="alert">
                Não foi possível carregar as voltas: {laps.error}
              </p>
            )}
            {laps.data !== null && laps.data.length === 0 && (
              <p className="muted">Nenhuma volta nesta gravação.</p>
            )}
            {laps.data !== null && laps.data.length > 0 && (
              <LapTable laps={laps.data} selected={lapNumber} onSelect={setLapNumber} />
            )}

            {lap !== null && (
              <section className="lap-view">
                <h2 className="lap-view__title">
                  Volta {lap.number}
                  <span className="lap-view__time">{formatLapTime(lap.lapTimeSeconds)}</span>
                </h2>
                {series.error !== null && (
                  <p role="alert" className="alert">
                    Não foi possível carregar os canais: {series.error}
                  </p>
                )}
                {series.data !== null && (
                  <TraceChart
                    series={series.data}
                    trackLengthMeters={session.trackLengthMeters}
                    stale={series.loading}
                  />
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/**
 * A volta que abre selecionada: a melhor válida; sem válida, a primeira
 * completa; sem completa, a primeira. Nunca uma volta cortada quando existe
 * uma inteira.
 */
function voltaInicial(laps: readonly LapDto[]): LapDto | undefined {
  const validas = laps.filter((lap) => lap.flags.length === 0 && lap.lapTimeSeconds !== null);
  if (validas.length > 0) {
    return validas.reduce((melhor, lap) =>
      (lap.lapTimeSeconds ?? Infinity) < (melhor.lapTimeSeconds ?? Infinity) ? lap : melhor,
    );
  }
  return laps.find((lap) => lap.isComplete) ?? laps[0];
}
