import type { ChannelSeries, Lap, ReferenceLap, TelemetrySession } from '@telemetry/domain';

/**
 * Tradução entre o modelo e o que vai no JSON do SQLite.
 *
 * Existe porque `Date` não sobrevive a `JSON.stringify` de ida e volta: volta
 * string. Deixar isso implícito é como um `recordedAt` vira texto no meio do
 * domínio e ninguém percebe até quebrar uma comparação.
 */
interface StoredSession extends Omit<TelemetrySession, 'recordedAt'> {
  readonly recordedAt: string | null;
}

export function encodeSession(session: TelemetrySession): string {
  const stored: StoredSession = {
    ...session,
    recordedAt: session.recordedAt?.toISOString() ?? null,
  };
  return JSON.stringify(stored);
}

export function decodeSession(payload: string): TelemetrySession {
  const stored = JSON.parse(payload) as StoredSession;
  return {
    ...stored,
    recordedAt: stored.recordedAt === null ? null : new Date(stored.recordedAt),
  };
}

export const encodeLap = (lap: Lap): string => JSON.stringify(lap);
export const decodeLap = (payload: string): Lap => JSON.parse(payload) as Lap;

/**
 * Séries: cabeçalho em JSON, valores em binário.
 *
 * Em JSON puro, uma volta de Road Atlanta ocupava **616 KB** — seis canais de
 * quatro mil pontos, cada número virando vinte e tantos caracteres de texto. Cem
 * stints de vinte voltas dariam 1,18 GB no computador do piloto, para guardar o
 * que o `.ibt` original já tem.
 *
 * Duas mudanças resolvem:
 *
 * 1. **O eixo `x` não é gravado.** Ele é uma grade uniforme — o ponto `i` está
 *    sempre em `from + i` dividido por `resolution - 1`. Guardar isso é guardar
 *    uma conta.
 * 2. **`y` vira `Float32`**, quatro bytes por ponto em vez de texto. A precisão
 *    sobra: o canal mais exigente é velocidade, e float32 erra menos de um
 *    milímetro por segundo na faixa que um carro de corrida usa.
 *
 * O resultado é exato para a nossa série, não aproximado: como a grade é
 * uniforme e contígua, `from` e `to` reconstroem o `x` ponto a ponto.
 */
interface StoredSeriesHeader {
  readonly channel: string;
  readonly unit: string;
  readonly axis: ChannelSeries['axis'];
  /** Quantos pontos a grade inteira teria, de 0 a 1. */
  readonly resolution: number;
  /** Índice do primeiro ponto coberto pela gravação. */
  readonly from: number;
  readonly length: number;
}

const FLOAT_BYTES = 4;

export function encodeSeries(series: readonly ChannelSeries[]): Uint8Array {
  const cabecalhos: StoredSeriesHeader[] = [];
  let totalPontos = 0;

  for (const serie of series) {
    const { resolution, from } = gradeDe(serie);
    cabecalhos.push({
      channel: serie.channel,
      unit: serie.unit,
      axis: serie.axis,
      resolution,
      from,
      length: serie.y.length,
    });
    totalPontos += serie.y.length;
  }

  const json = new TextEncoder().encode(JSON.stringify(cabecalhos));
  const saida = new Uint8Array(4 + json.length + totalPontos * FLOAT_BYTES);
  const view = new DataView(saida.buffer);
  view.setUint32(0, json.length, true);
  saida.set(json, 4);

  let offset = 4 + json.length;
  for (const serie of series) {
    for (const valor of serie.y) {
      view.setFloat32(offset, valor, true);
      offset += FLOAT_BYTES;
    }
  }
  return saida;
}

export function decodeSeries(payload: Uint8Array): readonly ChannelSeries[] {
  if (payload.byteLength < 4) return [];
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const tamanhoJson = view.getUint32(0, true);
  const cabecalhos = JSON.parse(
    new TextDecoder().decode(payload.subarray(4, 4 + tamanhoJson)),
  ) as StoredSeriesHeader[];

  let offset = 4 + tamanhoJson;
  return cabecalhos.map((cabecalho) => {
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < cabecalho.length; i += 1) {
      x.push(cabecalho.resolution > 1 ? (cabecalho.from + i) / (cabecalho.resolution - 1) : 0);
      y.push(view.getFloat32(offset, true));
      offset += FLOAT_BYTES;
    }
    return { channel: cabecalho.channel, unit: cabecalho.unit, axis: cabecalho.axis, x, y };
  });
}

/**
 * Descobre a grade a partir do `x` gravado.
 *
 * O passo entre pontos vizinhos é `1 / (resolution - 1)`; daí sai a resolução, e
 * o primeiro `x` dá o índice inicial. Série de um ponto só, ou com eixo que não
 * é grade, cai no caso degenerado e é guardada como se fosse a grade inteira —
 * nunca perde valor, no máximo perde compressão.
 */
function gradeDe(serie: ChannelSeries): { resolution: number; from: number } {
  const primeiro = serie.x[0] ?? 0;
  const segundo = serie.x[1];
  if (segundo === undefined || segundo <= primeiro) {
    return { resolution: Math.max(serie.y.length, 2), from: 0 };
  }
  const resolution = Math.round(1 / (segundo - primeiro)) + 1;
  return { resolution, from: Math.round(primeiro * (resolution - 1)) };
}

export const encodeReferenceLap = (reference: ReferenceLap): string => JSON.stringify(reference);
export const decodeReferenceLap = (payload: string): ReferenceLap =>
  JSON.parse(payload) as ReferenceLap;
