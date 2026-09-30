import type { ConnectedFrame } from './ConnectedFrame.js';
import type { OverlaySettings } from '../../../shared/overlay.js';
import { DriverCells, EmptyDriverCells, visibleColumns } from './DriverCells.js';
import { clock, seconds, sessionLabel } from './format.js';
import { useClock } from './hooks.js';
import { selectRelative } from './rows.js';

/**
 * Quem está perto do piloto **na pista**, na ordem da pista: os de cima estão à
 * frente, os de baixo atrás. O gap é o do sim (`CarIdxEstTime`).
 *
 * Na corrida, o nome muda de cor como no relative do próprio sim: quem está uma
 * volta ou mais à frente na corrida (vem colocar volta) e quem está atrás (vai
 * tomar volta). Com a mesma volta, cor de texto normal.
 */
export function Relative({ frame, settings }: { frame: ConnectedFrame; settings: OverlaySettings }) {
  const now = useClock();
  const { session } = frame;
  const columns = visibleColumns(settings.relative.columns, session);
  const rows = selectRelative(
    frame.relative ?? [],
    settings.relative.carsAhead,
    settings.relative.carsBehind,
  );

  return (
    <div className="ov-panel ov-relative">
      <div className="ov-head">
        <span>{sessionLabel(session.sessionType)}</span>
        <span className="ov-head__mid">
          {session.lapsRemaining !== null
            ? `${session.lapsRemaining} voltas`
            : clock(session.timeRemainingSeconds)}
        </span>
        <span className="ov-head__clock">
          {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <table className="ov-table">
        <tbody>
          {rows.map((row, index) => {
            if (row === null) {
              return (
                // Vaga vazia: a posição na lista é a identidade dela.
                <tr key={`vaga-${index}`} className="ov-row is-empty">
                  <td className="ov-cell-pos" />
                  <EmptyDriverCells columns={columns} />
                  <td className="ov-cell-gap" />
                </tr>
              );
            }
            const lap = row.lapsAhead > 0 ? 'is-lap-ahead' : row.lapsAhead < 0 ? 'is-lap-behind' : '';
            return (
              <tr key={row.carIdx} className={`ov-row${row.isPlayer ? ' is-player' : ''}`}>
                <td className="ov-cell-pos">{row.classPosition ?? ''}</td>
                <DriverCells row={row} columns={columns} nameClass={lap} />
                <td className="ov-cell-gap">{row.isPlayer ? '' : seconds(row.gapSeconds)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
