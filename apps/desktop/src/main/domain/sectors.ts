import { type Arrivals, arrivalAt } from './arrivals.js';
import { InvariantError } from './errors.js';

/*
 * Setores da pista: o corte da volta que ninguém escolheu.
 *
 * Cortar o delta em trechos pela derivada exigiria dizer o que é mudança
 * "sustentada" — um limiar, que a regra 18 recusa. O setor é declarado pelo
 * próprio sim (`SplitTimeInfo.Sectors` na session info), é o mesmo que o piloto
 * vê na tela de tempos do iRacing, e não depende de onde o piloto freou.
 */

/**
 * Onde cada setor começa, em `lapDistPct`, na ordem da volta.
 *
 * O primeiro começa na linha (0); o último termina nela de novo, no fim da
 * volta. Em Road Atlanta, por exemplo: `[0, 0.167875, 0.442307, 0.787105]`.
 */
export type SectorStarts = readonly number[];

/**
 * Se a lista tem a forma de setores de uma pista: começa na linha, cresce
 * estritamente e fica antes de completar a volta.
 *
 * Quem lê a session info usa isto para devolver `null` em vez de setor torto;
 * quem calcula, para falhar alto se receber um.
 */
export function isValidSectorStarts(starts: readonly number[]): boolean {
  if (starts.length === 0 || starts[0] !== 0) return false;
  for (let i = 1; i < starts.length; i += 1) {
    const atual = starts[i] ?? Number.NaN;
    if (!(atual > (starts[i - 1] ?? Number.NaN) && atual < 1)) return false;
  }
  return true;
}

/**
 * Tempo de cada setor da volta, em segundos, na ordem dos setores.
 *
 * O tempo de um setor é quando a volta passou pelo fim dele menos quando passou
 * pelo começo. A passagem cai entre dois ticks e é interpolada entre eles, como
 * no delta (`arrivalAt`). O primeiro setor começa na linha, no instante zero da
 * volta; o último termina nela, no tempo de volta medido. Por isso a soma dos
 * setores é o tempo de volta — sem sobra e sem número escolhido.
 *
 * Setor cuja divisa a volta não amostrou fica `null`: extrapolar daria um tempo
 * plausível e inventado.
 */
export function sectorTimes(arrivals: Arrivals, starts: SectorStarts): (number | null)[] {
  if (!isValidSectorStarts(starts)) {
    throw new InvariantError(`Setores fora de forma: [${starts.join(', ')}]`);
  }

  // Quando a volta passou por cada divisa; a linha, no começo e no fim, é exata.
  const passagens: (number | null)[] = [0];
  let hint = 0;
  for (const inicio of starts.slice(1)) {
    const passagem = arrivalAt(arrivals, inicio, hint);
    passagens.push(passagem?.seconds ?? null);
    if (passagem !== null) hint = passagem.index;
  }
  passagens.push(arrivals.lapTimeSeconds);

  return starts.map((_, i) => {
    const comeco = passagens[i] ?? null;
    const fim = passagens[i + 1] ?? null;
    return comeco === null || fim === null ? null : fim - comeco;
  });
}
