import type { IdGeneratorPort } from '@telemetry/application';
import { toAnalysisReportId, toReferenceLapId, toSessionId } from '@telemetry/domain';
import { aSession } from '@telemetry/domain/testing';
import { describe, expect, it, vi } from 'vitest';
import type { EventPublisherPort } from '../ports/event-publisher.port.js';
import type {
  IngestedFileLogReaderPort,
  IngestedFileLogWriterPort,
} from '../ports/ingested-file-log.port.js';
import type { PublicationQueuePort } from '../ports/publication.port.js';
import type { SessionWriterPort } from '../ports/session-store.port.js';
import type { DecodedMetadata, TelemetryDecoderPort } from '../ports/telemetry-decoder.port.js';
import type { TelemetryFilePort, TelemetryFileRef } from '../ports/telemetry-file.port.js';
import { MissingChannelError } from '../shared/errors.js';
import { createIngestTelemetryFileHandler } from './ingest-telemetry-file.command.js';

const ref: TelemetryFileRef = { locator: '/telemetry/sessao.ibt', sizeBytes: 1024 };

const channel = (name: string) => ({
  name,
  description: name,
  unit: '',
  type: 'number' as const,
  valuesPerSample: 1,
});

const metadataWith = (channels: readonly string[]): DecodedMetadata => {
  const { id: _id, tickRate: _t, sampleCount: _s, channels: _c, ...session } = aSession();
  return {
    tickRate: 60,
    sampleCount: 120,
    channels: channels.map(channel),
    session,
  };
};

const ids: IdGeneratorPort = {
  nextSessionId: () => toSessionId('session-1'),
  nextReferenceLapId: () => toReferenceLapId('reference-1'),
  nextAnalysisReportId: () => toAnalysisReportId('report-1'),
};

const eventos = (): EventPublisherPort => ({ publish: vi.fn() });

const registroDeArquivos = (
  jaIngerido: string | null = null,
): IngestedFileLogReaderPort & IngestedFileLogWriterPort => ({
  findSessionByLocator: async () => (jaIngerido === null ? null : toSessionId(jaIngerido)),
  record: vi.fn(async () => undefined),
  forgetSession: vi.fn(async () => undefined),
});

const publicationQueue = (): PublicationQueuePort => ({
  enqueue: vi.fn(async () => undefined),
  pending: async () => [],
  markPublished: async () => undefined,
  markFailed: async () => undefined,
});

async function* numbers(values: readonly number[]): AsyncIterable<number> {
  for (const value of values) {
    yield value;
  }
}

function filePort(): TelemetryFilePort & { close: ReturnType<typeof vi.fn> } {
  const close = vi.fn(async () => undefined);
  return {
    open: async () => ref,
    read: async () => new Uint8Array(),
    close,
  };
}

describe('IngestTelemetryFile', () => {
  it('recusa arquivo sem os canais necessários, nomeando o que falta', async () => {
    const files = filePort();
    const decoder: TelemetryDecoderPort = {
      readMetadata: async () => metadataWith(['Speed']),
      readChannel: () => numbers([]),
    };
    const sessions: SessionWriterPort = { save: vi.fn(), delete: vi.fn() };

    const events = eventos();
    const handle = createIngestTelemetryFileHandler({
      files,
      decoder,
      sessions,
      ids,
      publicationQueue: publicationQueue(),
      events,
      ingestedFiles: registroDeArquivos(),
    });

    await expect(handle({ locator: ref.locator })).rejects.toThrow(MissingChannelError);
    expect(events.publish).not.toHaveBeenCalled();
    await expect(handle({ locator: ref.locator })).rejects.toThrow(/LapDistPct/);
    expect(sessions.save).not.toHaveBeenCalled();
  });

  it('fecha o arquivo mesmo quando a ingestão falha', async () => {
    const files = filePort();
    // Disco com defeito no meio da leitura: o catálogo passou, os bytes não.
    const decoder: TelemetryDecoderPort = {
      readMetadata: async () => metadataWith(['Lap', 'LapDistPct']),
      readChannel: async function* () {
        yield 0;
        throw new Error('leitura interrompida no meio do arquivo');
      },
    };

    const events = eventos();
    const handle = createIngestTelemetryFileHandler({
      files,
      decoder,
      sessions: { save: vi.fn(), delete: vi.fn() },
      ids,
      publicationQueue: publicationQueue(),
      events,
      ingestedFiles: registroDeArquivos(),
    });

    await expect(handle({ locator: ref.locator })).rejects.toThrow(/leitura interrompida/);
    expect(files.close).toHaveBeenCalledWith(ref);
    // Ingestão que falhou não anuncia sessão nova: evento é fato consumado.
    expect(events.publish).not.toHaveBeenCalled();
  });
});

describe('IngestTelemetryFile, idempotência por arquivo', () => {
  it('arquivo já ingerido devolve a sessão existente sem reabrir nada', async () => {
    const files = filePort();
    const abrir = vi.spyOn(files, 'open');
    const events = eventos();
    const sessions: SessionWriterPort = { save: vi.fn(), delete: vi.fn() };

    const handle = createIngestTelemetryFileHandler({
      files,
      decoder: { readMetadata: vi.fn(), readChannel: vi.fn() },
      sessions,
      ids,
      publicationQueue: publicationQueue(),
      events,
      ingestedFiles: registroDeArquivos('session-de-ontem'),
    });

    await expect(handle({ locator: ref.locator })).resolves.toBe('session-de-ontem');
    // Nem abre o arquivo: é isso que deixa o watcher varrer a pasta toda a cada
    // abertura do aplicativo sem custo.
    expect(abrir).not.toHaveBeenCalled();
    expect(sessions.save).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });
});
