import { IncompatibleReferenceError } from '../shared/errors.js';
import type { ReferenceLapId } from '../shared/id.js';
import type { ChannelSeries } from '../telemetry/channel.js';
import type { Lap } from '../telemetry/lap.js';
import type { CarRef, TrackRef } from '../telemetry/session.js';

/** De onde a volta de referência veio. */
export type ReferenceLapOrigin = 'imported-file' | 'session-lap';

/**
 * Volta guardada para servir de referência de comparação.
 *
 * Guarda as séries já normalizadas por distância, porque é lida muito mais vezes
 * do que escrita.
 */
export interface ReferenceLap {
  readonly id: ReferenceLapId;
  readonly label: string;
  readonly origin: ReferenceLapOrigin;
  readonly track: TrackRef;
  readonly car: CarRef;
  readonly lap: Lap;
  /** Séries no eixo `lapDistPct`. */
  readonly series: readonly ChannelSeries[];
}

/** O que precisa bater para uma comparação significar alguma coisa. */
export interface ComparisonSubject {
  readonly track: TrackRef;
  readonly car: CarRef;
}

export function isComparableWith(reference: ReferenceLap, target: ComparisonSubject): boolean {
  return reference.track.id === target.track.id && reference.car.id === target.car.id;
}

/**
 * Recusa comparação entre pista ou carro diferentes.
 *
 * O delta entre carros diferentes existe matematicamente e não significa nada.
 * Falhar aqui é melhor que devolver um número plausível e errado.
 */
export function assertComparable(reference: ReferenceLap, target: ComparisonSubject): void {
  if (reference.track.id !== target.track.id) {
    throw new IncompatibleReferenceError(
      `Referência é de ${reference.track.name}, a volta é de ${target.track.name}`,
    );
  }
  if (reference.car.id !== target.car.id) {
    throw new IncompatibleReferenceError(
      `Referência é do ${reference.car.name}, a volta é do ${target.car.name}`,
    );
  }
}
