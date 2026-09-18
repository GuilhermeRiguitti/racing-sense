import type { TelemetryFilePort, TelemetryFileRef } from '@telemetry/application-desktop';
import type { ByteSource } from '@telemetry/ibt-core';

/**
 * Liga a porta de arquivo da aplicação à `ByteSource` que o decoder espera.
 *
 * São duas abstrações parecidas de propósito: `TelemetryFilePort` é o que a
 * aplicação precisa; `ByteSource` é o que o decoder (uma lib) define. Traduzir
 * aqui é o que impede o vocabulário da lib de subir para o caso de uso.
 */
export function toByteSource(files: TelemetryFilePort, ref: TelemetryFileRef): ByteSource {
  return {
    byteLength: ref.sizeBytes,
    read: (offset, length) => files.read(ref, offset, length),
  };
}
