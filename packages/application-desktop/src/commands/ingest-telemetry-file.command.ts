import type { IdGeneratorPort } from '@telemetry/application';
import { detectLaps, type Lap, type SessionId, type TelemetrySession } from '@telemetry/domain';
import type { PublicationQueuePort } from '../ports/publication.port.js';
import type { SessionWriterPort } from '../ports/session-store.port.js';
import type { TelemetryDecoderPort } from '../ports/telemetry-decoder.port.js';
import type { TelemetryFilePort } from '../ports/telemetry-file.port.js';
import { collectChannel } from '../shared/collect-channel.js';
import { MissingChannelError } from '../shared/errors.js';

/**
 * Canais exigidos para recortar voltas.
 *
 * Isto **não** é catálogo fixo de telemetria: o catálogo continua vindo do
 * arquivo, em runtime. São os poucos canais sem os quais o recorte de voltas é
 * impossível. A presença é verificada contra o catálogo real e a ausência falha
 * com o nome do canal — em vez de produzir volta errada em silêncio.
 */
export const REQUIRED_LAP_CHANNELS = ['Lap', 'LapDistPct'] as const;

export interface IngestTelemetryFileCommand {
  /** Onde o arquivo está, no vocabulário do adapter (caminho, chave...). */
  readonly locator: string;
}

export interface IngestTelemetryFileDeps {
  readonly files: TelemetryFilePort;
  readonly decoder: TelemetryDecoderPort;
  readonly sessions: SessionWriterPort;
  readonly ids: IdGeneratorPort;
  /** Fila de publicação. Enfileirar é local e instantâneo; enviar é outro caso de uso. */
  readonly publicationQueue: PublicationQueuePort;
}

export type IngestTelemetryFileHandler = (
  command: IngestTelemetryFileCommand,
) => Promise<SessionId>;

/**
 * Ingere um arquivo de telemetria e guarda a sessão com as voltas recortadas.
 *
 * Comando: muda estado e devolve só o identificador do que foi criado.
 */
export function createIngestTelemetryFileHandler(
  deps: IngestTelemetryFileDeps,
): IngestTelemetryFileHandler {
  return async ({ locator }) => {
    const ref = await deps.files.open(locator);
    try {
      const metadata = await deps.decoder.readMetadata(ref);

      const available = new Set(metadata.channels.map((channel) => channel.name));
      const missing = REQUIRED_LAP_CHANNELS.filter((name) => !available.has(name));
      if (missing.length > 0) {
        throw new MissingChannelError(
          `Arquivo sem os canais necessários para recortar voltas: ${missing.join(', ')}`,
        );
      }

      const [lapNumber, lapDistPct] = await Promise.all([
        collectChannel(deps.decoder.readChannel(ref, 'Lap')),
        collectChannel(deps.decoder.readChannel(ref, 'LapDistPct')),
      ]);

      const laps: readonly Lap[] = detectLaps({
        tickRate: metadata.tickRate,
        lapNumber,
        lapDistPct,
      });

      const session: TelemetrySession = {
        ...metadata.session,
        id: deps.ids.nextSessionId(),
        tickRate: metadata.tickRate,
        sampleCount: metadata.sampleCount,
        channels: metadata.channels,
      };

      await deps.sessions.save({ session, laps, seriesByLap: new Map() });

      // Publica tudo automaticamente, mas só enfileirando: a ingestão não espera
      // rede, e a sessão nasce privada no servidor (ADR 0013).
      await deps.publicationQueue.enqueue(session.id);

      return session.id;
    } finally {
      await deps.files.close(ref);
    }
  };
}
