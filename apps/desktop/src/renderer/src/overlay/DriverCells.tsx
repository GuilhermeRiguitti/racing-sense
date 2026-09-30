import type { DriverColumns, DriverRowDto, OverlaySessionDto } from '../../../shared/overlay.js';
import { inkOn, iRating, safetyRating } from './format.js';

/**
 * As colunas de piloto que o relative e a classificação dividem.
 *
 * Coluna que não distingue ninguém some sozinha: marca num grid de um
 * fabricante só, modelo num grid de um carro só, faixa de classe numa sessão de
 * uma classe. É o que deixa o overlay enxuto sem o piloto ter que desligar nada.
 */
export interface VisibleColumns {
  readonly classBar: boolean;
  readonly carNumber: boolean;
  readonly make: boolean;
  readonly model: boolean;
  readonly license: boolean;
  readonly iRating: boolean;
}

export function visibleColumns(columns: DriverColumns, session: OverlaySessionDto): VisibleColumns {
  return {
    classBar: session.multiClass,
    carNumber: columns.carNumber,
    make: columns.make && session.multiMake,
    model: columns.model && session.multiCar,
    license: columns.license,
    iRating: columns.iRating,
  };
}

/** As células de piloto, na ordem: classe, número, marca, nome (e modelo), carteira, iRating. */
export function DriverCells({
  row,
  columns,
  nameClass = '',
}: {
  row: DriverRowDto;
  columns: VisibleColumns;
  nameClass?: string;
}) {
  return (
    <>
      {columns.classBar && (
        <td className="ov-cell-class">
          <span className="ov-class-bar" style={{ background: row.classColor ?? 'transparent' }} />
        </td>
      )}
      {columns.carNumber && <td className="ov-cell-number">{row.carNumber}</td>}
      {columns.make && (
        <td className="ov-cell-make">
          {row.carMake !== null && (
            <span className="ov-make" title={row.carMakeName ?? undefined}>
              {row.carMake}
            </span>
          )}
        </td>
      )}
      <td className={`ov-cell-name ${nameClass}`}>
        <span className="ov-name">{row.name}</span>
        {columns.model && <span className="ov-model">{row.carModel}</span>}
        {row.onPitRoad && <span className="ov-tag">BOX</span>}
      </td>
      {columns.license && (
        <td className="ov-cell-license">
          {row.license !== null && (
            <span
              className="ov-license"
              style={{
                background: row.license.color ?? 'transparent',
                color: inkOn(row.license.color),
              }}
            >
              {row.license.letter} {safetyRating(row.license.safetyRating)}
            </span>
          )}
        </td>
      )}
      {columns.iRating && <td className="ov-cell-ir">{iRating(row.iRating)}</td>}
    </>
  );
}

/** Uma vaga vazia com as mesmas colunas: mantém a altura e as larguras da tabela. */
export function EmptyDriverCells({ columns }: { columns: VisibleColumns }) {
  return (
    <>
      {columns.classBar && <td className="ov-cell-class" />}
      {columns.carNumber && <td className="ov-cell-number" />}
      {columns.make && <td className="ov-cell-make" />}
      <td className="ov-cell-name" />
      {columns.license && <td className="ov-cell-license" />}
      {columns.iRating && <td className="ov-cell-ir" />}
    </>
  );
}
