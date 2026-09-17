import type { ChannelSeries, Lap, SessionId, TelemetrySession } from '@telemetry/domain';

/**
 * Leitura e escrita são portas separadas.
 *
 * Não é cerimônia: uma query recebe só o `SessionReaderPort` e, com isso, é
 * impossível ela escrever por engano — a regra de CQS passa a ser verificada
 * pelo compilador em vez de por revisão de código.
 */
export interface SessionReaderPort {
  list(): Promise<readonly TelemetrySession[]>;
  findById(id: SessionId): Promise<TelemetrySession | null>;
  listLaps(id: SessionId): Promise<readonly Lap[]>;
  /** Séries já normalizadas por distância de uma volta. */
  readLapSeries(id: SessionId, lapNumber: number): Promise<readonly ChannelSeries[]>;
}

export interface SessionWriterPort {
  /** Grava sessão, voltas e séries de uma vez: estado meio gravado é pior que nada. */
  save(input: {
    session: TelemetrySession;
    laps: readonly Lap[];
    seriesByLap: ReadonlyMap<number, readonly ChannelSeries[]>;
  }): Promise<void>;
  delete(id: SessionId): Promise<void>;
}
