import { describe, expect, it } from 'vitest';
import type { ClassStandingsDto, RelativeRowDto, StandingRowDto } from '../../../shared/overlay.js';
import { inkOn, lapTime } from './format.js';
import { selectRelative, selectStandings } from './rows.js';

const row = (carIdx: number, isPlayer = false) =>
  ({ carIdx, isPlayer }) as unknown as StandingRowDto & RelativeRowDto;

const classOf = (count: number, player: number | null): ClassStandingsDto => ({
  classId: 1,
  className: 'GT3',
  classColor: null,
  strengthOfField: null,
  rows: Array.from({ length: count }, (_, i) => row(i, i === player)),
});

describe('linhas da classificação', () => {
  it('o topo, os vizinhos do piloto e a marca do salto entre eles', () => {
    const [group] = selectStandings([classOf(20, 10)], { leaders: 3, aroundPlayer: 2, otherClasses: 3 });

    expect(group?.lines.map((l) => (l.kind === 'gap' ? '…' : l.row.carIdx))).toEqual([
      0, 1, 2, '…', 8, 9, 10, 11, 12,
    ]);
  });

  it('piloto perto do topo: sem salto', () => {
    const [group] = selectStandings([classOf(10, 2)], { leaders: 3, aroundPlayer: 2, otherClasses: 3 });

    expect(group?.lines.map((l) => (l.kind === 'gap' ? '…' : l.row.carIdx))).toEqual([0, 1, 2, 3, 4]);
  });

  it('outra classe: só o topo', () => {
    const groups = selectStandings([classOf(5, 0), classOf(8, null)], {
      leaders: 1,
      aroundPlayer: 0,
      otherClasses: 2,
    });

    expect(groups[1]?.lines).toHaveLength(2);
  });
});

describe('linhas do relative', () => {
  it('vaga vazia onde falta carro, para a janela não mudar de altura', () => {
    const rows = [row(5), row(1, true), row(7), row(8)];

    expect(selectRelative(rows, 2, 2).map((r) => r?.carIdx ?? null)).toEqual([null, 5, 1, 7, 8]);
  });
});

describe('formatos', () => {
  it('tempo de volta em pt-BR', () => {
    expect(lapTime(83.4567)).toBe('1:23,457');
    expect(lapTime(null)).toBe('—');
  });

  it('texto sobre a cor do sim: o de maior contraste', () => {
    expect(inkOn('#feec04')).toBe('#000000');
    expect(inkOn('#0153db')).toBe('#ffffff');
  });
});
