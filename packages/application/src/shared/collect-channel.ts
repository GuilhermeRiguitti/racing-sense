/**
 * Materializa um canal inteiro em memória.
 *
 * Use com parcimônia e só para canais de controle (`Lap`, `LapDistPct`), que
 * são necessários por inteiro para recortar voltas. Canal de análise se consome
 * em streaming — uma stint de 30 min a 60 Hz passa de 100 mil pontos por canal.
 */
export async function collectChannel(values: AsyncIterable<number>): Promise<number[]> {
  const collected: number[] = [];
  for await (const value of values) {
    collected.push(value);
  }
  return collected;
}
