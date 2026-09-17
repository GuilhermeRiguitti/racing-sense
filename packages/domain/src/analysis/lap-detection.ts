import { NotImplementedError } from '../shared/errors.js';
import type { Lap } from '../telemetry/lap.js';

/**
 * Sinais necessários para recortar voltas.
 *
 * Só números: a detecção é função pura, não sabe de arquivo nem de canal por nome.
 * Quem traduz canal do sim para estes campos é o caso de uso.
 */
export interface LapSignals {
  readonly tickRate: number;
  /** Número da volta reportado pelo sim, por amostra. */
  readonly lapNumber: readonly number[];
  /** Posição na volta, de 0 a 1, por amostra. */
  readonly lapDistPct: readonly number[];
  /** Tempo da volta corrente, quando o sim fornece. Melhora a precisão. */
  readonly lapCurrentLapTime?: readonly number[];
  /** Marca out lap e in lap. */
  readonly onPitRoad?: readonly boolean[];
}

/**
 * Recorta as amostras em voltas.
 *
 * TODO(etapa 2): implementar. Armadilhas conhecidas, em ordem de importância:
 *  - `lapDistPct` volta a zero na linha, mas também oscila perto dela: só a
 *    transição não basta, precisa de histerese;
 *  - a gravação começa e termina no meio de uma volta;
 *  - reset para os boxes e teleporte produzem salto de distância que não é volta;
 *  - out lap e in lap são voltas válidas para o sim e inúteis para comparação.
 */
export function detectLaps(_signals: LapSignals): Lap[] {
  throw new NotImplementedError('detectLaps: recorte de voltas ainda não implementado');
}
