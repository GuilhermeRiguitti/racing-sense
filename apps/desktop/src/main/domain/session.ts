import type { CarLimits, SetupNode } from './car-setup.js';
import type { ChannelDescriptor } from './channel.js';
import type { SessionConditions } from './conditions.js';
import type { SessionId } from './id.js';
import type { SectorStarts } from './sectors.js';

/** Pista mais layout. Layouts diferentes da mesma pista são pistas diferentes. */
export interface TrackRef {
  readonly id: string;
  readonly name: string;
  readonly config: string | null;
  /**
   * Comprimento do traçado em metros.
   *
   * Não é enfeite: é o que converte `lapDistPct` em distância de verdade. Sem
   * ele, a resolução das séries teria que ser um número fixo, e número fixo
   * significa resolução diferente em cada pista — grossa numa longa, exagerada
   * numa curta. `null` quando o arquivo não informa.
   */
  readonly lengthMeters: number | null;
}

export interface CarRef {
  readonly id: string;
  readonly name: string;
}

/**
 * Uma gravação de telemetria já ingerida.
 *
 * `channels` é o catálogo montado em runtime a partir do arquivo — nunca uma
 * lista fixa no código.
 */
export interface TelemetrySession {
  readonly id: SessionId;
  readonly track: TrackRef;
  readonly car: CarRef;
  readonly driverName: string | null;
  readonly sessionType: string | null;
  readonly recordedAt: Date | null;
  readonly tickRate: number;
  readonly sampleCount: number;
  readonly channels: readonly ChannelDescriptor[];
  /** Temperatura, horário, céu. Sem isso a comparação entre pilotos mente. */
  readonly conditions: SessionConditions;
  /**
   * O acerto com que a sessão foi rodada, como o sim declarou. `null` quando o
   * arquivo não traz — série de acerto fixo esconde, e sessão gravada antes
   * de o app ler o acerto também não tem.
   *
   * Um `.ibt` por saída dos boxes: trocar acerto na garagem começa arquivo
   * novo, então um acerto por sessão é o que o dado dá. O que muda **durante**
   * as voltas são os ajustes de dentro do carro (`dc*`), e esses são canais.
   */
  readonly setup: readonly SetupNode[] | null;
  readonly carLimits: CarLimits;
  /**
   * Onde cada setor da pista começa, como o sim declarou (`SectorStarts`).
   * `null` quando o arquivo não traz o bloco, ou a sessão foi gravada antes de
   * o app lê-lo — nunca setores inventados.
   */
  readonly sectorStartPcts: SectorStarts | null;
}

/** Duração da gravação em segundos. */
export function sessionDurationSeconds(session: TelemetrySession): number {
  return session.sampleCount / session.tickRate;
}
