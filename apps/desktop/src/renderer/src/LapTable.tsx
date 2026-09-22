import type { LapDto } from '@telemetry/contracts';
import { formatLapTime } from './chart-math.js';

/** O que cada marcação quer dizer, na língua de quem pilota. */
const MOTIVO: Record<LapDto['flags'][number], string> = {
  incomplete: 'gravação cortada',
  pit: 'passou pelo box',
  'off-track': 'saiu da pista',
};

interface Props {
  readonly laps: readonly LapDto[];
  readonly selected: number | null;
  readonly onSelect: (lapNumber: number) => void;
}

/**
 * As voltas da sessão, com a situação de cada uma.
 *
 * Toda volta aparece, válida ou não — a inválida é o registro do que o piloto
 * rodou (ADR 0018). A situação é ícone mais texto: cor sozinha não diz nada
 * para quem não distingue verde de vermelho.
 */
export function LapTable({ laps, selected, onSelect }: Props) {
  const melhor = laps
    .filter((lap) => lap.flags.length === 0 && lap.lapTimeSeconds !== null)
    .reduce<LapDto | null>(
      (atual, lap) =>
        atual === null || (lap.lapTimeSeconds ?? Infinity) < (atual.lapTimeSeconds ?? Infinity)
          ? lap
          : atual,
      null,
    );

  return (
    <table className="laps">
      <caption className="laps__caption">Voltas</caption>
      <thead>
        <tr>
          <th scope="col">Volta</th>
          <th scope="col" className="num">
            Tempo
          </th>
          <th scope="col">Situação</th>
        </tr>
      </thead>
      <tbody>
        {laps.map((lap) => {
          const valida = lap.flags.length === 0;
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
              <td>
                <span className={`status status--${valida ? 'good' : 'critical'}`}>
                  <StatusIcon valida={valida} />
                  {valida ? 'Válida' : 'Inválida'}
                </span>
                {!valida && (
                  <span className="laps__reason">
                    {lap.flags.map((flag) => MOTIVO[flag]).join(' · ')}
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
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
