import type {
  CarMakeDto,
  DriverColumns,
  DriverRowDto,
  OverlaySessionDto,
} from '../../../shared/overlay.js';
import { inkOn, iRating, safetyRating } from './format.js';
import { makeLogo } from './make-logo.js';

/**
 * As colunas de piloto que o relative e a classificação dividem.
 *
 * Coluna que não distingue ninguém some sozinha: marca num grid de um
 * fabricante só, faixa de classe numa sessão de uma classe. É o que deixa o overlay enxuto sem o piloto ter que desligar nada.
 */
export interface VisibleColumns {
  readonly classBar: boolean;
  readonly carNumber: boolean;
  readonly make: boolean;
  readonly license: boolean;
  readonly iRating: boolean;
}

export function visibleColumns(columns: DriverColumns, session: OverlaySessionDto): VisibleColumns {
  return {
    classBar: session.multiClass,
    carNumber: columns.carNumber,
    make: columns.make && session.multiMake,
    license: columns.license,
    iRating: columns.iRating,
  };
}

/** As células de piloto, na ordem: classe, número, marca, nome, carteira, iRating. */
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
          {row.carMake !== null && <MakeBadge make={row.carMake} carName={row.carName} />}
        </td>
      )}
      <td className={`ov-cell-name ${nameClass}`}>
        <span className="ov-name">{row.name}</span>
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

/** A logo do fabricante; sem logo no repositório, a sigla. O nome do carro fica no `title`. */
function MakeBadge({ make, carName }: { make: CarMakeDto; carName: string }) {
  const logo = makeLogo(make.id);
  if (logo === null) {
    return (
      <span className="ov-make" title={carName}>
        {make.short}
      </span>
    );
  }
  return <img className="ov-make-logo" src={logo} alt={make.name} title={carName} />;
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
