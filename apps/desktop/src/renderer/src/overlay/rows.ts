import type {
  ClassStandingsDto,
  RelativeRowDto,
  StandingRowDto,
} from '../../../shared/overlay.js';

/** Uma linha da classificação, ou a marca de que linhas foram puladas ali. */
export type StandingLine =
  | { readonly kind: 'row'; readonly row: StandingRowDto }
  | { readonly kind: 'gap' };

export interface StandingGroup {
  readonly standings: ClassStandingsDto;
  readonly lines: readonly StandingLine[];
}

/**
 * Quais linhas da classificação aparecem, para caber na tela sem virar lista de
 * 60 carros: na classe do piloto, o topo e os vizinhos dele; nas outras, só o
 * topo. Onde linhas foram puladas entra uma marca, para o salto de posição não
 * parecer erro.
 */
export function selectStandings(
  classes: readonly ClassStandingsDto[],
  options: { leaders: number; aroundPlayer: number; otherClasses: number },
): StandingGroup[] {
  return classes.flatMap((standings): StandingGroup[] => {
    const playerIndex = standings.rows.findIndex((row) => row.isPlayer);
    const keep = new Set<number>();
    if (playerIndex === -1) {
      for (let i = 0; i < Math.min(options.otherClasses, standings.rows.length); i += 1) keep.add(i);
    } else {
      for (let i = 0; i < Math.min(options.leaders, standings.rows.length); i += 1) keep.add(i);
      const from = Math.max(0, playerIndex - options.aroundPlayer);
      const to = Math.min(standings.rows.length - 1, playerIndex + options.aroundPlayer);
      for (let i = from; i <= to; i += 1) keep.add(i);
    }
    if (keep.size === 0) return [];

    const lines: StandingLine[] = [];
    let last = -1;
    for (const index of [...keep].sort((a, b) => a - b)) {
      if (index > last + 1) lines.push({ kind: 'gap' });
      lines.push({ kind: 'row', row: standings.rows[index] as StandingRowDto });
      last = index;
    }
    return [{ standings, lines }];
  });
}

/**
 * As linhas do relative: sempre `ahead` acima e `behind` abaixo do piloto, com
 * vaga vazia onde não há carro — a janela não muda de altura a cada carro que
 * entra no box.
 */
export function selectRelative(
  rows: readonly RelativeRowDto[],
  ahead: number,
  behind: number,
): (RelativeRowDto | null)[] {
  const playerIndex = rows.findIndex((row) => row.isPlayer);
  if (playerIndex === -1) return Array.from({ length: ahead + behind + 1 }, () => null);
  const above = rows.slice(Math.max(0, playerIndex - ahead), playerIndex);
  const below = rows.slice(playerIndex + 1, playerIndex + 1 + behind);
  return [
    ...Array.from({ length: ahead - above.length }, () => null),
    ...above,
    rows[playerIndex] as RelativeRowDto,
    ...below,
    ...Array.from({ length: behind - below.length }, () => null),
  ];
}
