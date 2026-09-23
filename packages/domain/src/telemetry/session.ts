import type { SessionId } from '../shared/id.js';
import type { ChannelDescriptor } from './channel.js';
import type { SessionConditions } from './conditions.js';

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
}

/** Duração da gravação em segundos. */
export function sessionDurationSeconds(session: TelemetrySession): number {
  return session.sampleCount / session.tickRate;
}
