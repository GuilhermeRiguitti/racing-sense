import type { ChannelDescriptor, TelemetrySession } from '@telemetry/domain';
import type { TelemetryFileRef } from './telemetry-file.port.js';

/** O que se sabe do arquivo antes de tocar nas amostras. */
export interface DecodedMetadata {
  readonly tickRate: number;
  readonly sampleCount: number;
  readonly channels: readonly ChannelDescriptor[];
  /** Pista, carro, piloto — o que vier da session info. */
  readonly session: Omit<TelemetrySession, 'id' | 'tickRate' | 'sampleCount' | 'channels'>;
}

/**
 * Decodificação de telemetria.
 *
 * A aplicação não sabe que existe `.ibt`, header de 112 bytes ou CP1252 — isso é
 * assunto do adapter. Trocar o decoder (lib da comunidade, implementação própria,
 * outro formato de sim) é trocar quem implementa esta porta.
 */
export interface TelemetryDecoderPort {
  readMetadata(ref: TelemetryFileRef): Promise<DecodedMetadata>;

  /**
   * Valores de um canal, na ordem gravada.
   *
   * Um canal por chamada e em streaming: uma stint de 30 min a 60 Hz passa de
   * 100 mil amostras por canal, e carregar tudo de uma vez é o caminho curto
   * para estourar memória.
   */
  readChannel(ref: TelemetryFileRef, channel: string): AsyncIterable<number>;
}
