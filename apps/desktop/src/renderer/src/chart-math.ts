import type { SeriesDto } from '../../shared/dto.js';

/**
 * Contas de desenho. Nada aqui é análise: é converter número em pixel.
 *
 * Ficam separadas dos componentes para serem testadas sem navegador.
 */

/**
 * Marcações "redondas" para um eixo: 0, 50, 100, 150 — nunca 0, 47,3, 94,6.
 *
 * O passo sai da própria faixa de valores (1, 2 ou 5 vezes uma potência de 10),
 * que é a convenção de qualquer eixo legível.
 */
function passoRedondo(faixa: number, alvo: number): number {
  const bruto = faixa / alvo;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const fracao = bruto / potencia;
  return (fracao <= 1 ? 1 : fracao <= 2 ? 2 : fracao <= 5 ? 5 : 10) * potencia;
}

export function niceTicks(min: number, max: number, alvo: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || alvo < 1) {
    return [min];
  }
  const passo = passoRedondo(max - min, alvo);

  const ticks: number[] = [];
  for (let valor = Math.ceil(min / passo) * passo; valor <= max + passo * 1e-9; valor += passo) {
    // Arredonda o erro de ponto flutuante acumulado (0,30000000000000004).
    ticks.push(Number(valor.toPrecision(12)));
  }
  return ticks;
}

/**
 * O teto do eixo: o primeiro múltiplo do passo das marcações acima do valor.
 *
 * Anda no mesmo passo das marcações para o eixo terminar numa delas: 252 km/h
 * vira 300, não 500. Um teto que pula de 250 direto para 500 desperdiça metade
 * da altura do painel.
 */
export function niceCeil(valor: number, alvo = 4): number {
  if (valor <= 0) return 0;
  const passo = passoRedondo(valor, alvo);
  return Math.ceil(valor / passo - 1e-9) * passo;
}

/**
 * Índice da amostra mais perto de `alvo` num eixo que só cresce.
 *
 * Busca binária: seis mil amostras por volta, e isto roda a cada movimento do
 * mouse. Eixo que não cresce sempre (volta com carro manobrando no box) cai na
 * varredura linear, que é mais lenta mas nunca devolve o ponto errado.
 */
export function nearestIndex(xs: readonly number[], alvo: number): number {
  if (xs.length === 0) return -1;
  if (!naoDecrescente(xs)) return nearestLinear(xs, alvo);

  let baixo = 0;
  let alto = xs.length - 1;
  while (baixo < alto) {
    const meio = (baixo + alto) >> 1;
    if ((xs[meio] ?? 0) < alvo) baixo = meio + 1;
    else alto = meio;
  }
  const anterior = baixo - 1;
  if (anterior >= 0 && Math.abs((xs[anterior] ?? 0) - alvo) <= Math.abs((xs[baixo] ?? 0) - alvo)) {
    return anterior;
  }
  return baixo;
}

const verificados = new WeakMap<readonly number[], boolean>();

function naoDecrescente(xs: readonly number[]): boolean {
  const conhecido = verificados.get(xs);
  if (conhecido !== undefined) return conhecido;
  let ok = true;
  for (let i = 1; i < xs.length; i += 1) {
    if ((xs[i] ?? 0) < (xs[i - 1] ?? 0)) {
      ok = false;
      break;
    }
  }
  verificados.set(xs, ok);
  return ok;
}

function nearestLinear(xs: readonly number[], alvo: number): number {
  let melhor = 0;
  for (let i = 1; i < xs.length; i += 1) {
    if (Math.abs((xs[i] ?? 0) - alvo) < Math.abs((xs[melhor] ?? 0) - alvo)) melhor = i;
  }
  return melhor;
}

/** 105,467 s → "1:45.467". O formato que o piloto vê na tela do sim. */
export function formatLapTime(segundos: number | null): string {
  if (segundos === null || !Number.isFinite(segundos)) return '—';
  const minutos = Math.floor(segundos / 60);
  const resto = segundos - minutos * 60;
  return `${minutos}:${resto.toFixed(3).padStart(6, '0')}`;
}

/**
 * Caminho SVG de uma série.
 *
 * Canal contínuo liga os pontos com reta. Canal discreto desenha degrau: o
 * valor se mantém até a amostra seguinte, e muda de uma vez — marcha não passa
 * por 3,5 no caminho da 3ª para a 4ª (regra 18d).
 */
export function seriesPath(
  xs: readonly number[],
  ys: readonly number[],
  px: (x: number) => number,
  py: (y: number) => number,
  degrau: boolean,
): string {
  let d = '';
  for (let i = 0; i < xs.length; i += 1) {
    const x = px(xs[i] ?? 0);
    const y = py(ys[i] ?? 0);
    if (i === 0) {
      d += `M${x.toFixed(1)},${y.toFixed(1)}`;
    } else if (degrau) {
      d += `H${x.toFixed(1)}V${y.toFixed(1)}`;
    } else {
      d += `L${x.toFixed(1)},${y.toFixed(1)}`;
    }
  }
  return d;
}

/**
 * Delta em segundos com sinal sempre explícito: +0,312 é tempo perdido,
 * −0,145 é ganho. Três casas, a resolução em que o sim mostra o tempo de volta.
 * O sinal de menos é o tipográfico (U+2212), da mesma largura do mais.
 */
export function formatDelta(segundos: number): string {
  const texto = Math.abs(segundos).toFixed(3).replace('.', ',');
  if (Number(texto.replace(',', '.')) === 0) return '0,000';
  return `${segundos > 0 ? '+' : '\u2212'}${texto}`;
}

/**
 * O valor gravado mais perto do cursor — **só dentro do trecho que a volta
 * cobriu**. Fora dele, não existe valor: mostrar a última amostra ali faria a
 * tela dizer "100% de freio" num ponto da pista onde o carro nunca esteve.
 * O limite é o próprio intervalo gravado, não uma distância escolhida.
 */
export function valueAtCursor(serie: SeriesDto, cursor: number | null): number | undefined {
  if (cursor === null || serie.x.length === 0) return undefined;
  const primeiro = Math.min(serie.x[0] ?? 0, serie.x[serie.x.length - 1] ?? 0);
  const ultimo = Math.max(serie.x[0] ?? 0, serie.x[serie.x.length - 1] ?? 0);
  if (cursor < primeiro || cursor > ultimo) return undefined;
  const indice = nearestIndex(serie.x, cursor);
  return indice >= 0 ? serie.y[indice] : undefined;
}

/** Posição na volta como o piloto pensa: metros, quando a pista informa o comprimento. */
export function formatDistance(fracao: number, trackLengthMeters: number | null): string {
  return trackLengthMeters === null
    ? `${(fracao * 100).toFixed(1).replace('.', ',')}%`
    : `${Math.round(fracao * trackLengthMeters).toLocaleString('pt-BR')} m`;
}
