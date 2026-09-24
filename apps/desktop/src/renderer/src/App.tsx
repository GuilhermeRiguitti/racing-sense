import { useEffect, useState } from 'react';
import type { LapDto } from '../../shared/dto.js';
import { bridge } from './bridge.js';
import { LapTable } from './LapTable.js';
import { LapView } from './LapView.js';
import { SessionHeader } from './SessionHeader.js';
import { SessionList } from './SessionList.js';
import { SetupSheet } from './SetupSheet.js';
import { StintCharts } from './StintCharts.js';
import { useBridgeQuery } from './useBridgeQuery.js';
import { useSessions } from './useSessions.js';

/**
 * A tela do piloto: sessões, a sessão volta a volta, e a volta escolhida ao
 * longo da pista, contra a referência.
 *
 * Abre já na sessão mais recente e na volta mais útil dela, com a referência
 * mais recente do mesmo carro e pista, porque o caso de uso é "acabei de sair
 * do carro": ninguém quer clicar três vezes para ver onde perdeu tempo.
 */
export function App() {
  const { sessions, loading, error } = useSessions();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lapNumber, setLapNumber] = useState<number | null>(null);
  /**
   * A referência que o piloto escolheu. `undefined` é "ainda não escolheu":
   * vale a mais recente compatível. `null` é "escolheu ver sem referência".
   */
  const [escolhaReferencia, setEscolhaReferencia] = useState<string | null | undefined>(
    undefined,
  );
  const [versaoReferencias, setVersaoReferencias] = useState(0);

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
  const stint = useBridgeQuery(sessionId, () => bridge().getSessionStint(sessionId ?? ''));
  const referencias = useBridgeQuery(`referencias#${versaoReferencias}`, () =>
    bridge().listReferenceLaps(),
  );

  useEffect(() => {
    if (laps.data === null) return;
    if (lapNumber !== null && laps.data.some((lap) => lap.number === lapNumber)) return;
    setLapNumber(voltaInicial(laps.data)?.number ?? null);
  }, [laps.data, lapNumber]);

  const session = sessions.find((s) => s.id === sessionId) ?? null;
  const lap = laps.data?.find((l) => l.number === lapNumber) ?? null;

  // Só referência do mesmo carro e pista entra na lista: as outras seriam
  // recusadas pela comparação (ADR 0008), então nem são oferecidas.
  const compativeis =
    session === null
      ? []
      : (referencias.data ?? []).filter(
          (r) => r.trackId === session.trackId && r.carId === session.carId,
        );
  const referenceId =
    escolhaReferencia === undefined
      ? (compativeis[0]?.id ?? null)
      : compativeis.some((r) => r.id === escolhaReferencia)
        ? escolhaReferencia
        : (compativeis[0]?.id ?? null);

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
              <div className="session-overview">
                <LapTable laps={laps.data} selected={lapNumber} onSelect={setLapNumber} />
                {stint.data !== null && (
                  <StintCharts
                    stint={stint.data}
                    channels={session.channels}
                    selected={lapNumber}
                    onSelect={setLapNumber}
                  />
                )}
              </div>
            )}

            {lap !== null && (
              <LapView
                session={session}
                lap={lap}
                references={compativeis}
                referenceId={referenceId}
                onReferenceChange={setEscolhaReferencia}
                onReferenceCreated={(id) => {
                  setEscolhaReferencia(id);
                  setVersaoReferencias((v) => v + 1);
                }}
              />
            )}

            <SetupSheet setup={session.setup} />
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
