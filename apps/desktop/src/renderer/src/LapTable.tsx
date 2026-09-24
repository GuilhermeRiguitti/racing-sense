import { countsForSession } from '../../main/domain/lap.js';
import type { LapDto } from '../../shared/dto.js';
import { formatDelta, formatLapTime } from './chart-math.js';

/** O que cada marcação quer dizer, na língua de quem pilota. */
export const MOTIVO: Record<LapDto['flags'][number], string> = {
  incomplete: 'gravação cortada',
  pit: 'passou pelo box',
  'off-track': 'saiu da pista',
  slowdown: 'tomou slow down',
};

/**
 * A situação de uma volta, do ponto de vista do que se pode fazer com ela:
 *
 * - `valid` — limpa; serve de referência e é comparada;
 * - `session` — saiu da pista sem punição do sim: conta na evolução da sessão,
 *   mas não vira referência (ADR 0021);
 * - `invalid` — box, gravação cortada ou slow down: fica fora de tudo.
 */
export type LapStanding = 'valid' | 'session' | 'invalid';

export function lapStanding(lap: LapDto): LapStanding {
  if (lap.flags.length === 0 && lap.lapTimeSeconds !== null) return 'valid';
  return countsForSession(lap) ? 'session' : 'invalid';
}

/**
 * A tabela fala como o sim: válida ou inválida, e os incidentes ao lado. Saída
 * de pista sem slow down conta na sessão, então aparece como válida — o "1x"
 * na coluna Inc. já diz o que aconteceu, e a tela da volta explica por que ela
 * não vira referência.
 */
const valida = (situacao: LapStanding) => situacao !== 'invalid';

/** `2` → "2x", como o iRacing escreve. Sem o contador no arquivo, traço. */
const formatIncidents = (incidentes: number | null) =>
  incidentes === null ? '—' : `${incidentes}x`;

interface Props {
  /** As voltas a listar — quem chama já decidiu se as inválidas entram. */
  readonly laps: readonly LapDto[];
  readonly selected: number | null;
  readonly onSelect: (lapNumber: number) => void;
  /** Quantas voltas inválidas estão escondidas, e como mostrá-las. */
  readonly hiddenCount: number;
  readonly showingInvalid: boolean;
  readonly onToggleInvalid: () => void;
}

/**
 * As voltas da sessão, com a situação de cada uma.
 *
 * A inválida continua gravada — é o registro do que o piloto rodou (ADR 0018) —
 * mas não aparece por padrão: out lap, in lap e volta com slow down só poluíam
 * a leitura da sessão (ADR 0021). Um botão traz de volta. A situação é ícone
 * mais texto: cor sozinha não diz nada para quem não distingue as cores. O
 * motivo da invalidação fica na tela da volta, não na tabela.
 */
export function LapTable({
  laps,
  selected,
  onSelect,
  hiddenCount,
  showingInvalid,
  onToggleInvalid,
}: Props) {
  // A melhor entre as que a tabela chama de válidas — senão uma volta "válida"
  // mais rápida que a "melhor" pareceria erro.
  const melhor = laps
    .filter((lap) => valida(lapStanding(lap)))
    .reduce<LapDto | null>(
      (atual, lap) =>
        atual === null || (lap.lapTimeSeconds ?? Infinity) < (atual.lapTimeSeconds ?? Infinity)
          ? lap
          : atual,
      null,
    );

  return (
    <div className="laps-box">
      <div className="laps__caption">
        <span>Voltas</span>
        {(hiddenCount > 0 || showingInvalid) && (
          <button type="button" className="link-button" onClick={onToggleInvalid}>
            {showingInvalid ? 'Esconder inválidas' : `Mostrar inválidas (${hiddenCount})`}
          </button>
        )}
      </div>
      {laps.length === 0 ? (
        <p className="muted laps__empty">
          Nenhuma volta completa, sem box e sem slow down nesta sessão.
        </p>
      ) : (
        <table className="laps">
          <thead>
            <tr>
              <th scope="col">Volta</th>
              <th scope="col" className="num">
                Tempo
              </th>
              <th scope="col" className="num">
                <abbr title="Diferença para a melhor volta válida da sessão">Δ melhor</abbr>
              </th>
              <th scope="col" className="num">
                <abbr title="Incidentes da volta">Inc.</abbr>
              </th>
              <th scope="col">Situação</th>
            </tr>
          </thead>
          <tbody>
            {laps.map((lap) => {
              const situacao = lapStanding(lap);
              const escolhida = lap.number === selected;
              return (
                <tr
                  key={lap.number}
                  className={escolhida ? 'is-selected' : undefined}
                  aria-selected={escolhida}
                  tabIndex={0}
                  onClick={() => onSelect(lap.number)}
                  onKeyDown={(evento) => {
                    if (evento.key === 'Enter' || evento.key === ' ') {
                      evento.preventDefault();
                      onSelect(lap.number);
                    }
                  }}
                >
                  <td>{lap.number}</td>
                  <td className="num">
                    {formatLapTime(lap.lapTimeSeconds)}
                    {melhor?.number === lap.number && <span className="laps__best">melhor</span>}
                  </td>
                  <td className="num laps__delta">
                    {melhor !== null &&
                    lap.lapTimeSeconds !== null &&
                    melhor.lapTimeSeconds !== null &&
                    melhor.number !== lap.number
                      ? formatDelta(lap.lapTimeSeconds - melhor.lapTimeSeconds)
                      : ''}
                  </td>
                  <td className="num">{formatIncidents(lap.incidents)}</td>
                  <td>
                    <span className={`status status--${valida(situacao) ? 'valid' : 'invalid'}`}>
                      <StatusIcon valida={valida(situacao)} />
                      {valida(situacao) ? 'Válida' : 'Inválida'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StatusIcon({ valida }: { valida: boolean }) {
  return (
    <svg className="status__icon" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="6" r="6" />
      {valida ? (
        <path d="M3.3 6.2 5.2 8 8.8 4.3" className="status__mark" />
      ) : (
        <path d="M4 4 8 8M8 4 4 8" className="status__mark" />
      )}
    </svg>
  );
}
