import type { ReferenceLap } from '../reference/reference-lap.js';
import { assertComparable } from '../reference/reference-lap.js';
import { NotImplementedError } from '../shared/errors.js';
import type { ChannelSeries } from '../telemetry/channel.js';
import type { Lap } from '../telemetry/lap.js';
import type { CarRef, TrackRef } from '../telemetry/session.js';

/** Trecho da volta onde o delta se move de forma relevante. */
export interface ComparisonSegment {
  readonly startDistPct: number;
  readonly endDistPct: number;
  /** Negativo = a volta analisada ganhou tempo no trecho. */
  readonly deltaSeconds: number;
  readonly label: string | null;
}

export interface LapComparison {
  readonly referenceLapId: ReferenceLap['id'];
  readonly lapNumber: number;
  readonly totalDeltaSeconds: number;
  /** Delta acumulado ao longo da volta, eixo `lapDistPct`. */
  readonly deltaSeries: ChannelSeries;
  readonly segments: readonly ComparisonSegment[];
}

export interface ComparisonTarget {
  readonly track: TrackRef;
  readonly car: CarRef;
  readonly lap: Lap;
  readonly series: readonly ChannelSeries[];
}

/**
 * Compara uma volta contra a referência.
 *
 * A checagem de compatibilidade roda **antes** de qualquer conta: comparar
 * carros ou pistas diferentes produz número plausível e sem sentido.
 *
 * TODO(etapa 3): implementar o delta. O acumulado sai da diferença de tempo para
 * percorrer cada fatia de distância; os segmentos, de onde a derivada do delta
 * muda de sinal de forma sustentada.
 */
export function compareToReference(
  reference: ReferenceLap,
  target: ComparisonTarget,
): LapComparison {
  assertComparable(reference, target);
  throw new NotImplementedError('compareToReference: cálculo de delta não implementado');
}
