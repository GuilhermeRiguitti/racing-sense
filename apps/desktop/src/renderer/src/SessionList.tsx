import type { SessionDto } from '../../shared/dto.js';

interface Props {
  readonly sessions: readonly SessionDto[];
  readonly selected: string | null;
  readonly onSelect: (sessionId: string) => void;
}

const quando = (iso: string | null) =>
  iso === null
    ? 'data desconhecida'
    : new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });

/** As sessões, a mais recente primeiro — é a que o piloto acabou de rodar. */
export function SessionList({ sessions, selected, onSelect }: Props) {
  const ordenadas = [...sessions].sort((a, b) =>
    (b.recordedAt ?? '').localeCompare(a.recordedAt ?? ''),
  );
  return (
    <nav className="sessions" aria-label="Sessões">
      <h2 className="sessions__title">Sessões</h2>
      <ul>
        {ordenadas.map((session) => (
          <li key={session.id}>
            <button
              type="button"
              className={`sessions__item${session.id === selected ? ' is-selected' : ''}`}
              aria-current={session.id === selected ? 'true' : undefined}
              onClick={() => onSelect(session.id)}
            >
              <span className="sessions__track">{session.trackName}</span>
              <span className="sessions__meta">{session.carName}</span>
              <span className="sessions__meta">{quando(session.recordedAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
