import { useEffect, useMemo, useState } from 'react';
import type { LapDto } from '../../shared/dto.js';
import { bridge } from './bridge.js';
import { LapTable, lapStanding } from './LapTable.js';
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
  /** Out lap, in lap e slow down ficam escondidos até o piloto pedir (ADR 0021). */
  const [mostrarInvalidas, setMostrarInvalidas] = useState(false);

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

  const visivel = (lap: LapDto) => mostrarInvalidas || lapStanding(lap) !== 'invalid';
  const voltasVisiveis = useMemo(
    () =>
      laps.data?.filter((lap) => mostrarInvalidas || lapStanding(lap) !== 'invalid') ?? null,
    [laps.data, mostrarInvalidas],
  );
  const escondidas = laps.data?.filter((lap) => lapStanding(lap) === 'invalid').length ?? 0;
  const stintVisivel = stint.data?.filter((s) => visivel(s.lap)) ?? null;

  // A volta aberta tem que estar na lista: esconder as inválidas com uma delas
  // aberta troca para a melhor visível, em vez de mostrar uma volta que sumiu.
  useEffect(() => {
    if (voltasVisiveis === null) return;
    if (lapNumber !== null && voltasVisiveis.some((lap) => lap.number === lapNumber)) return;
    setLapNumber(voltaInicial(voltasVisiveis)?.number ?? null);
  }, [voltasVisiveis, lapNumber]);

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
            {laps.data !== null && laps.data.length > 0 && voltasVisiveis !== null && (
              <div className="session-overview">
                <LapTable
                  laps={voltasVisiveis}
                  selected={lapNumber}
                  onSelect={setLapNumber}
                  hiddenCount={escondidas}
                  showingInvalid={mostrarInvalidas}
                  onToggleInvalid={() => setMostrarInvalidas((m) => !m)}
                />
                {stint.data !== null && stintVisivel !== null && (
                  <StintCharts
                    stint={stintVisivel}
                    fullStint={stint.data}
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
 * A volta que abre selecionada: a melhor válida; sem válida, a melhor que conta
 * na sessão; sem nenhuma, a primeira completa. Nunca uma volta cortada quando
 * existe uma inteira.
 */
function voltaInicial(laps: readonly LapDto[]): LapDto | undefined {
  const limpas = laps.filter((lap) => lapStanding(lap) === 'valid');
  const validas = limpas.length > 0 ? limpas : laps.filter((lap) => lapStanding(lap) === 'session');
  if (validas.length > 0) {
    return validas.reduce((melhor, lap) =>
      (lap.lapTimeSeconds ?? Infinity) < (melhor.lapTimeSeconds ?? Infinity) ? lap : melhor,
    );
  }
  return laps.find((lap) => lap.isComplete) ?? laps[0];
}
