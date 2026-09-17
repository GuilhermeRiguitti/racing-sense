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

export const encodeSeries = (series: readonly ChannelSeries[]): string => JSON.stringify(series);
export const decodeSeries = (payload: string): readonly ChannelSeries[] =>
  JSON.parse(payload) as ChannelSeries[];

export const encodeReferenceLap = (reference: ReferenceLap): string => JSON.stringify(reference);
export const decodeReferenceLap = (payload: string): ReferenceLap =>
  JSON.parse(payload) as ReferenceLap;
