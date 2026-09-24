import { useMemo, useState } from 'react';
import type { LapDto, ReferenceLapDto, SessionDto } from '../../shared/dto.js';
import { bridge } from './bridge.js';
import { tabsFor } from './channels.js';
import { formatDelta, formatLapTime } from './chart-math.js';
import { EngineerPanel } from './EngineerPanel.js';
import { TraceChart } from './TraceChart.js';
import { useBridgeQuery } from './useBridgeQuery.js';

interface Props {
  readonly session: SessionDto;
  readonly lap: LapDto;
  /** Referências da mesma pista e do mesmo carro — as únicas comparáveis. */
  readonly references: readonly ReferenceLapDto[];
  /** A referência escolhida, ou `null` para ver a volta sozinha. */
  readonly referenceId: string | null;
  readonly onReferenceChange: (referenceId: string | null) => void;
  /** Promoveu a volta a referência: quem guarda a lista consulta de novo. */
  readonly onReferenceCreated: (referenceLapId: string) => void;
}

const MOTIVO: Record<LapDto['flags'][number], string> = {
  incomplete: 'gravação cortada',
  pit: 'passou pelo box',
  'off-track': 'saiu da pista',
};

/**
 * Uma volta, do jeito que o engenheiro a abre: contra a referência, canal a
 * canal ao longo da pista, e o que ela fez com o carro ao lado.
 *
 * Volta inválida é mostrada inteira — é nela que o piloto quer ver onde saiu
 * da pista — mas não é comparada: sem delta, sem referência por baixo
 * (ADR 0018). A tela diz por quê, em vez de só esconder.
 */
export function LapView({
  session,
  lap,
  references,
  referenceId,
  onReferenceChange,
  onReferenceCreated,
}: Props) {
  const [aba, setAba] = useState('driving');
  const [cursor, setCursor] = useState<number | null>(null);
  const [promovendo, setPromovendo] = useState(false);
  const [erroPromover, setErroPromover] = useState<string | null>(null);

  const valida = lap.flags.length === 0 && lap.lapTimeSeconds !== null;
  const comparar = valida && referenceId !== null;
  const referencia = references.find((r) => r.id === referenceId) ?? null;

  const series = useBridgeQuery(`${session.id}#${lap.number}`, () =>
    bridge().getLapSeries(session.id, lap.number),
  );
  const serieReferencia = useBridgeQuery(comparar ? referenceId : null, () =>
    bridge().getReferenceLapSeries(referenceId ?? ''),
  );
  const comparacao = useBridgeQuery(
    comparar ? `${session.id}#${lap.number}#${referenceId}` : null,
    () =>
      bridge().compareLapToReference({
        sessionId: session.id,
        lapNumber: lap.number,
        referenceLapId: referenceId ?? '',
      }),
  );

  const abas = useMemo(() => tabsFor(session), [session]);
  const abaAtual = abas.find((a) => a.id === aba) ?? abas[0];

  const promover = async () => {
    setPromovendo(true);
    setErroPromover(null);
    const quando = session.recordedAt === null ? '' : ` · ${new Date(session.recordedAt).toLocaleDateString('pt-BR')}`;
    const resultado = await bridge().importReferenceLap({
      sessionId: session.id,
      lapNumber: lap.number,
      label: `Volta ${lap.number} · ${formatLapTime(lap.lapTimeSeconds)}${quando}`,
    });
    setPromovendo(false);
    if (resultado.failed === true) {
      setErroPromover(resultado.message);
    } else {
      onReferenceCreated(resultado.value.referenceLapId);
    }
  };

  const total = comparar ? (comparacao.data?.totalDeltaSeconds ?? null) : null;

  return (
    <section className="lap-view" aria-labelledby="lap-view-title">
      <div className="lap-view__bar">
        <h2 id="lap-view-title" className="lap-view__title">
          Volta {lap.number}
          <span className="lap-view__time">{formatLapTime(lap.lapTimeSeconds)}</span>
        </h2>

        {total !== null && referencia !== null && (
          <div className="stat" aria-live="polite">
            <span className="stat__label">Para a referência</span>
            <span className="stat__value">
              {formatDelta(total)} s
              <span className="stat__direction">
                {total > 0 ? 'mais lenta' : total < 0 ? 'mais rápida' : 'igual'}
              </span>
            </span>
          </div>
        )}

        <div className="lap-view__actions">
          <label className="field">
            <span className="field__label">Referência</span>
            <select
              value={referenceId ?? ''}
              onChange={(e) => onReferenceChange(e.target.value === '' ? null : e.target.value)}
              disabled={references.length === 0}
            >
              <option value="">
                {references.length === 0 ? 'nenhuma para este carro e pista' : 'sem referência'}
              </option>
              {references.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button"
            onClick={() => void promover()}
            disabled={!valida || promovendo}
            title={
              valida
                ? 'Guarda esta volta como régua para as próximas'
                : 'Só volta válida vira referência'
            }
          >
            {promovendo ? 'Guardando…' : 'Usar como referência'}
          </button>
        </div>
      </div>

      {!valida && (
        <p className="notice">
          <strong>Volta inválida</strong> ({lap.flags.map((f) => MOTIVO[f]).join(', ') || 'sem tempo'}
          ): aparece inteira, mas não é comparada nem vira referência.
          {lap.offTrackStretches !== null &&
            lap.offTrackStretches.length > 0 &&
            ' Os trechos fora da pista estão marcados no gráfico.'}
        </p>
      )}
      {erroPromover !== null && (
        <p role="alert" className="alert">
          Não foi possível guardar a referência: {erroPromover}
        </p>
      )}
      {comparacao.error !== null && (
        <p role="alert" className="alert">
          Não foi possível comparar com a referência: {comparacao.error}
        </p>
      )}

      <div className="tabs" role="tablist" aria-label="Grupos de canais">
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={a.id === abaAtual?.id}
            className={`tabs__tab${a.id === abaAtual?.id ? ' is-selected' : ''}`}
            onClick={() => setAba(a.id)}
          >
            {a.title}
          </button>
        ))}
      </div>

      {series.error !== null && (
        <p role="alert" className="alert">
          Não foi possível carregar os canais: {series.error}
        </p>
      )}
      {series.data !== null && abaAtual !== undefined && (
        <div className="lap-view__body">
          <TraceChart
            panels={abaAtual.panels}
            lap={series.data}
            reference={comparar ? serieReferencia.data : null}
            delta={comparar ? (comparacao.data?.deltaSeries ?? null) : null}
            offTrack={lap.offTrackStretches}
            trackLengthMeters={session.trackLengthMeters}
            stale={series.loading || comparacao.loading}
            cursor={cursor}
            onCursor={setCursor}
          />
          <EngineerPanel session={session} lap={lap} series={series.data} cursor={cursor} />
        </div>
      )}
    </section>
  );
}
