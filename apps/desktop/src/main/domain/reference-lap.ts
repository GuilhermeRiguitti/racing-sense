import type { ChannelSeries } from './channel.js';
import { IncompatibleReferenceError } from './errors.js';
import type { ReferenceLapId } from './id.js';
import type { Lap } from './lap.js';
import type { CarRef, TrackRef } from './session.js';

/** De onde a volta de referência veio. */
export type ReferenceLapOrigin = 'imported-file' | 'session-lap';

/**
 * Volta guardada para servir de referência de comparação.
 *
 * Guarda as séries da volta como foram gravadas — amostra bruta, com a posição
 * medida de cada uma (ADR 0019). É com essas posições que o delta é calculado.
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
