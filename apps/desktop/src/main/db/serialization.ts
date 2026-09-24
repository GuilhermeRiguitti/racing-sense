import { UNKNOWN_CAR_LIMITS } from '../domain/car-setup.js';
import type { ChannelSeries } from '../domain/channel.js';
import type { AnalysisReport } from '../domain/insight.js';
import type { Lap } from '../domain/lap.js';
import type { ReferenceLap } from '../domain/reference-lap.js';
import type { TelemetrySession } from '../domain/session.js';

/**
 * Tradução entre o modelo e o que vai no JSON do SQLite.
 *
 * Existe porque `Date` não sobrevive a `JSON.stringify` de ida e volta: volta
 * string. Deixar isso implícito é como um `recordedAt` vira texto no meio do
 * domínio e ninguém percebe até quebrar uma comparação.
 */
interface StoredSession extends Omit<TelemetrySession, 'recordedAt' | 'setup' | 'carLimits'> {
  readonly recordedAt: string | null;
  /** Ausentes em sessão gravada antes de o app ler acerto e limites do carro. */
  readonly setup?: TelemetrySession['setup'];
  readonly carLimits?: TelemetrySession['carLimits'];
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
    // Sessão antiga não tem os campos: "não sei", nunca um acerto inventado.
    setup: stored.setup ?? null,
    carLimits: stored.carLimits ?? UNKNOWN_CAR_LIMITS,
  };
}

export const encodeLap = (lap: Lap): string => JSON.stringify(lap);
export const decodeLap = (payload: string): Lap => JSON.parse(payload) as Lap;

/**
 * Séries: cabeçalho em JSON, valores em binário, **sem perda nenhuma**.
 *
 * Em JSON puro uma volta ocupava 616 KB — cada número virando vinte e tantos
 * caracteres. Em binário, cada array usa a largura mais estreita que guarda
 * todos os valores **exatamente**:
 *
 * - `Float32` quando todo valor do array sobrevive à conversão sem mudar um bit.
 *   É o caso de todo canal que o arquivo já grava como `float` — 197 dos 288 —
 *   e dos inteiros pequenos, como marcha;
 * - `Float64` quando algum valor não sobrevive. É o caso dos canais `double` do
 *   arquivo e de bitfield com bit alto ligado.
 *
 * Quem decide é o dado, conferindo valor a valor — não uma tabela de tipos
 * mantida à mão. Canal novo, de qualquer um dos cinco tipos do iRacing, entra
 * sem mexer aqui e sem perder precisão.
 *
 * E o eixo é gravado **uma vez por volta**, não uma por canal. Os canais de uma
 * volta foram medidos nas mesmas amostras, então o `x` deles é o mesmo array —
 * gravá-lo seis vezes era metade do banco repetindo a mesma distância. O
 * compartilhamento é decidido comparando valor a valor, não presumido: série
 * com eixo próprio continua tendo o seu.
 */
interface StoredSeriesHeader {
  readonly channel: string;
  readonly unit: string;
  readonly type: ChannelSeries['type'];
  readonly axis: ChannelSeries['axis'];
  readonly length: number;
  readonly xWidth: Width;
  readonly yWidth: Width;
  /** Índice de uma série anterior com eixo idêntico, ou `null` se o eixo é próprio. */
  readonly xFrom: number | null;
}

type Width = 4 | 8;

/** A largura mais estreita que guarda todos os valores sem alterar nenhum. */
function larguraExata(valores: readonly number[]): Width {
  for (const valor of valores) {
    if (Math.fround(valor) !== valor) return 8;
  }
  return 4;
}

function escrever(view: DataView, offset: number, valores: readonly number[], largura: Width) {
  let posicao = offset;
  for (const valor of valores) {
    if (largura === 4) view.setFloat32(posicao, valor, true);
    else view.setFloat64(posicao, valor, true);
    posicao += largura;
  }
  return posicao;
}

function ler(view: DataView, offset: number, quantidade: number, largura: Width): number[] {
  const valores: number[] = [];
  for (let i = 0; i < quantidade; i += 1) {
    const posicao = offset + i * largura;
    valores.push(largura === 4 ? view.getFloat32(posicao, true) : view.getFloat64(posicao, true));
  }
  return valores;
}

function mesmosValores(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

export function encodeSeries(series: readonly ChannelSeries[]): Uint8Array {
  const cabecalhos: StoredSeriesHeader[] = series.map((serie, indice) => {
    const anterior = series.findIndex((outra, j) => j < indice && mesmosValores(outra.x, serie.x));
    return {
      channel: serie.channel,
      unit: serie.unit,
      type: serie.type,
      axis: serie.axis,
      length: serie.y.length,
      xWidth: larguraExata(serie.x),
      yWidth: larguraExata(serie.y),
      xFrom: anterior >= 0 ? anterior : null,
    };
  });
  const corpo = cabecalhos.reduce(
    (total, c) => total + c.length * ((c.xFrom === null ? c.xWidth : 0) + c.yWidth),
    0,
  );

  const json = new TextEncoder().encode(JSON.stringify(cabecalhos));
  const saida = new Uint8Array(4 + json.length + corpo);
  const view = new DataView(saida.buffer);
  view.setUint32(0, json.length, true);
  saida.set(json, 4);

  let offset = 4 + json.length;
  series.forEach((serie, indice) => {
    const cabecalho = cabecalhos[indice] as StoredSeriesHeader;
    if (cabecalho.xFrom === null) {
      offset = escrever(view, offset, serie.x, cabecalho.xWidth);
    }
    offset = escrever(view, offset, serie.y, cabecalho.yWidth);
  });
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
  const eixos: (readonly number[])[] = [];
  return cabecalhos.map((cabecalho) => {
    let x: readonly number[];
    if (cabecalho.xFrom === null) {
      x = ler(view, offset, cabecalho.length, cabecalho.xWidth);
      offset += cabecalho.length * cabecalho.xWidth;
    } else {
      x = eixos[cabecalho.xFrom] ?? [];
    }
    eixos.push(x);
    const y = ler(view, offset, cabecalho.length, cabecalho.yWidth);
    offset += cabecalho.length * cabecalho.yWidth;
    return {
      channel: cabecalho.channel,
      unit: cabecalho.unit,
      type: cabecalho.type,
      axis: cabecalho.axis,
      x,
      y,
    };
  });
}

export const encodeReferenceLap = (reference: ReferenceLap): string => JSON.stringify(reference);
export const decodeReferenceLap = (payload: string): ReferenceLap =>
  JSON.parse(payload) as ReferenceLap;

interface StoredAnalysisReport extends Omit<AnalysisReport, 'generatedAt'> {
  readonly generatedAt: string;
}

export const encodeAnalysisReport = (report: AnalysisReport): string =>
  JSON.stringify({ ...report, generatedAt: report.generatedAt.toISOString() });

export function decodeAnalysisReport(payload: string): AnalysisReport {
  const stored = JSON.parse(payload) as StoredAnalysisReport;
  return { ...stored, generatedAt: new Date(stored.generatedAt) };
}
