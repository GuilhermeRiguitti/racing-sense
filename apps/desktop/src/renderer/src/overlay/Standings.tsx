import { Fragment } from 'react';
import type { OverlaySettings } from '../../../shared/overlay.js';
import type { ConnectedFrame } from './ConnectedFrame.js';
import { DriverCells, visibleColumns } from './DriverCells.js';
import { clock, gap, iRating, lapTime, sessionLabel } from './format.js';
import { selectStandings } from './rows.js';

/**
 * A classificação da sessão, por classe.
 *
 * Na corrida, a ordem e o gap são os do sim; no treino e na classificação, a
 * melhor volta (ver `standings` no domínio). Não é a lista inteira: o topo e os
 * vizinhos do piloto, com uma marca onde linhas foram puladas.
 */
export function Standings({ frame, settings }: { frame: ConnectedFrame; settings: OverlaySettings }) {
  const { session } = frame;
  const options = settings.standings;
  const columns = visibleColumns(options.columns, session);
  const groups = selectStandings(frame.standings ?? [], options);
  const extra = [
    options.columns.lastLap,
    options.columns.bestLap,
    options.columns.gap,
    options.columns.interval,
  ].filter(Boolean).length;
  const span =
    1 +
    Number(columns.classBar) +
    Number(columns.carNumber) +
    Number(columns.make) +
    1 +
    Number(columns.license) +
    Number(columns.iRating) +
    extra;

  return (
    <div className="ov-panel ov-standings">
      <div className="ov-head">
        <span>{sessionLabel(session.sessionType)}</span>
        <span className="ov-head__mid">
          {session.lapsRemaining !== null
            ? `${session.lapsRemaining} voltas`
            : clock(session.timeRemainingSeconds)}
        </span>
        <span className="ov-head__clock">{session.trackName}</span>
      </div>
      <table className="ov-table">
        <tbody>
          {groups.map(({ standings, lines }) => (
            <Fragment key={standings.classId}>
              {(session.multiClass || standings.strengthOfField !== null) && (
                <tr className="ov-class-head">
                  <td colSpan={span}>
                    {session.multiClass && (
                      <span
                        className="ov-class-bar"
                        style={{ background: standings.classColor ?? 'transparent' }}
                      />
                    )}
                    {session.multiClass && <strong>{standings.className}</strong>}
                    {standings.strengthOfField !== null && (
                      <span className="ov-muted">SOF {iRating(standings.strengthOfField)}</span>
                    )}
                    <span className="ov-muted">{standings.rows.length} carros</span>
                  </td>
                </tr>
              )}
              {lines.map((line, index) =>
                line.kind === 'gap' ? (
                  <tr key={`salto-${index}`} className="ov-skip">
                    <td colSpan={span}>···</td>
                  </tr>
                ) : (
                  <tr
                    key={line.row.carIdx}
                    className={`ov-row${line.row.isPlayer ? ' is-player' : ''}`}
                  >
                    <td className="ov-cell-pos">{line.row.classPosition}</td>
                    <DriverCells row={line.row} columns={columns} />
                    {options.columns.lastLap && (
                      <td className="ov-cell-time">{lapTime(line.row.lastLapTime)}</td>
                    )}
                    {options.columns.bestLap && (
                      <td className={`ov-cell-time${line.row.hasClassBestLap ? ' is-best' : ''}`}>
                        {lapTime(line.row.bestLapTime)}
                      </td>
                    )}
                    {options.columns.gap && <td className="ov-cell-gap">{gap(line.row.gap)}</td>}
                    {options.columns.interval && (
                      <td className="ov-cell-gap">{gap(line.row.interval)}</td>
                    )}
                  </tr>
                ),
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
