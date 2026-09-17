import type { SessionId } from '../shared/id.js';
import type { ChannelDescriptor } from './channel.js';

/** Pista mais layout. Layouts diferentes da mesma pista são pistas diferentes. */
export interface TrackRef {
  readonly id: string;
  readonly name: string;
  readonly config: string | null;
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
}

/** Duração da gravação em segundos. */
export function sessionDurationSeconds(session: TelemetrySession): number {
  return session.sampleCount / session.tickRate;
}
